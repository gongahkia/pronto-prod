import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { mergeEscalationHoldingReply } from "@/lib/channels/escalation-handoff";
import { query } from "@/lib/db";
import type { ChannelStatus } from "@/lib/types";

const channelStatuses: ChannelStatus[] = ["draft", "active", "disabled"];

export async function POST(request: Request) {
  const user = await requireUser("operator");
  const form = await request.formData();
  const channelId = String(form.get("channelId") ?? "");
  const clientId = String(form.get("clientId") ?? "");
  const status = String(form.get("status") ?? "draft");
  const externalId = String(form.get("externalId") ?? "");
  if (!channelStatuses.includes(status as ChannelStatus)) {
    return NextResponse.json({ error: "Invalid channel status." }, { status: 400 });
  }

  const channelResult = await query<{ client_id: string }>(
    "select client_id from channels where id = $1",
    [channelId],
  );
  const channel = channelResult.rows[0];
  if (!channel) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }
  if (channel.client_id !== clientId) {
    return NextResponse.json(
      { error: "Channel does not belong to the submitted client." },
      { status: 403 },
    );
  }

  const parsedSettings = parseJsonObject(String(form.get("settings") || "{}"), "settings");
  if (!parsedSettings.ok) {
    return NextResponse.json({ error: parsedSettings.error }, { status: 400 });
  }
  const holdingReply = form.get("escalationHoldingReply");
  const settings =
    holdingReply === null
      ? parsedSettings.value
      : mergeEscalationHoldingReply(parsedSettings.value, String(holdingReply));
  const credentials = parseJsonObject(
    String(form.get("credentials") || "{}"),
    "credentials",
  );
  if (!credentials.ok) {
    return NextResponse.json({ error: credentials.error }, { status: 400 });
  }

  await query(
    `
      update channels
      set status = $2,
          external_id = nullif($3, ''),
          settings = $4,
          credentials = $5,
          updated_at = now()
      where id = $1
    `,
    [channelId, status, externalId, settings, credentials.value],
  );
  await query(
    "insert into audit_logs (client_id, actor_user_id, action, target_type, target_id, metadata) values ($1, $2, 'channel.updated', 'channel', $3, $4)",
    [clientId, user.userId, channelId, { status }],
  );

  return NextResponse.redirect(new URL(`/operator/clients/${clientId}`, request.url), 303);
}

export function parseJsonObject(
  value: string,
  fieldName: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { ok: false, error: `Channel ${fieldName} must be a JSON object.` };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, error: `Channel ${fieldName} must be valid JSON.` };
  }
}
