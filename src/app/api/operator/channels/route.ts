import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { mergeEscalationHoldingReply } from "@/lib/channels/escalation-handoff";
import { query } from "@/lib/db";
import { assertSameOrigin } from "@/lib/http/csrf";
import type { ChannelKind, ChannelStatus } from "@/lib/types";

const channelStatuses: ChannelStatus[] = ["draft", "active", "disabled"];
const secretFieldNames = new Set([
  "accessToken",
  "appSecret",
  "botToken",
  "pageAccessToken",
  "apiKey",
  "verifyToken",
  "webhookSecret",
  "eventWebhookSecret",
]);

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const user = await requireUser("operator");
  const form = await request.formData();
  const channelId = String(form.get("channelId") ?? "");
  const clientId = String(form.get("clientId") ?? "");
  const status = String(form.get("status") ?? "draft");
  const externalId = String(form.get("externalId") ?? "");
  const returnTo = safeOperatorReturnPath(
    String(form.get("returnTo") ?? ""),
    `/operator/clients/${clientId}/channels`,
  );
  if (!channelStatuses.includes(status as ChannelStatus)) {
    return NextResponse.json({ error: "Invalid channel status." }, { status: 400 });
  }

  const channelResult = await query<{
    client_id: string;
    kind: ChannelKind;
    settings: Record<string, unknown>;
    credentials: Record<string, unknown>;
  }>(
    "select client_id, kind, settings, credentials from channels where id = $1",
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
  const submittedSettings = parsedSettings.ok ? parsedSettings.value : {};
  const holdingReply = form.get("escalationHoldingReply");
  const settingsBase = mergeStructuredFields({
    base: channel.settings,
    submitted: submittedSettings,
    form,
    scope: "settings",
  });
  const settings =
    holdingReply === null
      ? settingsBase
      : mergeEscalationHoldingReply(settingsBase, String(holdingReply));
  const credentials = parseJsonObject(
    String(form.get("credentials") || "{}"),
    "credentials",
  );
  const credentialValue = mergeStructuredFields({
    base: channel.credentials,
    submitted: credentials.ok ? credentials.value : {},
    form,
    scope: "credentials",
  });

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
    [channelId, status, externalId, settings, credentialValue],
  );
  await query(
    "insert into audit_logs (client_id, actor_user_id, action, target_type, target_id, metadata) values ($1, $2, 'channel.updated', 'channel', $3, $4)",
    [clientId, user.userId, channelId, { status }],
  );

  return NextResponse.redirect(new URL(returnTo, request.url), 303);
}

function mergeStructuredFields(input: {
  base: Record<string, unknown>;
  submitted: Record<string, unknown>;
  form: FormData;
  scope: "settings" | "credentials";
}): Record<string, unknown> {
  const next = { ...input.base, ...input.submitted };
  for (const [key, value] of input.form.entries()) {
    const prefix = `${input.scope}.`;
    if (!key.startsWith(prefix)) continue;
    const field = key.slice(prefix.length);
    const text = String(value).trim();
    if (!text) {
      if (!secretFieldNames.has(field)) delete next[field];
      continue;
    }
    next[field] = text;
  }
  return next;
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

function safeOperatorReturnPath(value: string, fallback: string): string {
  return value.startsWith("/operator") && !value.startsWith("//") ? value : fallback;
}
