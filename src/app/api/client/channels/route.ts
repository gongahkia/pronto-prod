import { NextResponse } from "next/server";
import { recordAuditLog } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { channelKinds } from "@/lib/channels/catalog";
import { query } from "@/lib/db";
import { assertSameOrigin } from "@/lib/http/csrf";
import type { ChannelKind } from "@/lib/types";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const user = await requireUser("client");
  if (!user.clientId) return NextResponse.json({ error: "Client workspace missing." }, { status: 400 });
  const form = await request.formData();
  const kind = String(form.get("kind") ?? "") as ChannelKind;
  const name = String(form.get("name") ?? "").trim();
  if (!channelKinds.includes(kind) || !name || name.length > 80) {
    return NextResponse.json({ error: "Choose a channel and a name up to 80 characters." }, { status: 400 });
  }
  const result = await query<{ id: string }>(
    "insert into channels (client_id, kind, name, status) values ($1, $2, $3, 'draft') returning id",
    [user.clientId, kind, name],
  );
  await recordAuditLog({
    clientId: user.clientId, actorUserId: user.userId,
    action: "channel.client_created", targetType: "channel", targetId: result.rows[0].id,
    metadata: { kind },
  });
  return NextResponse.redirect(new URL(`/client/assistant/channels?channel=${result.rows[0].id}`, request.url), 303);
}
