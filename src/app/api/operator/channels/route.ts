import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";

export async function POST(request: Request) {
  const user = await requireUser("operator");
  const form = await request.formData();
  const channelId = String(form.get("channelId") ?? "");
  const clientId = String(form.get("clientId") ?? "");
  const status = String(form.get("status") ?? "draft");
  const externalId = String(form.get("externalId") ?? "");
  const settings = JSON.parse(String(form.get("settings") || "{}"));
  const credentials = JSON.parse(String(form.get("credentials") || "{}"));

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
    [channelId, status, externalId, settings, credentials],
  );
  await query(
    "insert into audit_logs (client_id, actor_user_id, action, target_type, target_id, metadata) values ($1, $2, 'channel.updated', 'channel', $3, $4)",
    [clientId, user.userId, channelId, { status }],
  );

  return NextResponse.redirect(new URL(`/operator/clients/${clientId}`, request.url), 303);
}

