import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { processInboundMessage } from "@/lib/channels/process";
import { checkRateLimit, isTextWithinLimit } from "@/lib/http-limits";
import { canAccessClient } from "@/lib/rbac";
import type { Channel } from "@/lib/types";

export async function POST(request: Request) {
  const user = await requireUser();
  const body = await request.json();
  const text = String(body.text ?? "").trim();
  const requestedClientId = String(body.clientId ?? user.clientId ?? "");

  if (!text) {
    return NextResponse.json({ error: "Message text is required." }, { status: 400 });
  }
  if (!isTextWithinLimit(text)) {
    return NextResponse.json({ error: "Message text is too large." }, { status: 413 });
  }
  if (!canAccessClient(user, requestedClientId)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const rateLimit = checkRateLimit(`console:${requestedClientId}:${user.userId}`);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  const channelResult = await query<Channel>(
    `
      select * from channels
      where client_id = $1 and kind = 'console'
      order by created_at asc
      limit 1
    `,
    [requestedClientId],
  );
  const channel = channelResult.rows[0];
  if (!channel) {
    return NextResponse.json({ error: "Console channel not found." }, { status: 404 });
  }

  const result = await processInboundMessage({
    channelId: channel.id,
    channelKind: "console",
    externalMessageId: `console-${randomUUID()}`,
    externalThreadId: `console-${user.userId}-${requestedClientId}`,
    customerHandle: user.email,
    customerName: user.name,
    text,
    raw: { source: "pilot_console" },
  });

  return NextResponse.json(result);
}
