import { assertSameOrigin } from "@/lib/http/csrf";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { checkChannelHealth } from "@/lib/channels/health";
import { query } from "@/lib/db";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const user = await requireUser("operator");
  const form = await request.formData();
  const channelId = String(form.get("channelId") ?? "");
  const clientId = String(form.get("clientId") ?? "");
  const returnTo = safeOperatorReturnPath(
    String(form.get("returnTo") ?? ""),
    `/operator/clients/${clientId}/channels`,
  );

  if (!channelId || !clientId) {
    return NextResponse.json({ error: "channelId and clientId are required." }, { status: 400 });
  }

  const health = await checkChannelHealth(channelId);
  await query(
    "insert into audit_logs (client_id, actor_user_id, action, target_type, target_id, metadata) values ($1, $2, 'channel.health_checked', 'channel', $3, $4)",
    [clientId, user.userId, channelId, health],
  );

  return NextResponse.redirect(new URL(returnTo, request.url), 303);
}

function safeOperatorReturnPath(value: string, fallback: string): string {
  return value.startsWith("/operator") && !value.startsWith("//") ? value : fallback;
}
