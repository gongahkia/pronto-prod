import { NextResponse } from "next/server";
import { processInboundMessage } from "@/lib/channels/process";
import {
  getTelegramChannel,
  normalizeTelegramPayload,
  verifyTelegramSecret,
} from "@/lib/channels/telegram";
import { checkRateLimit, isBodyWithinLimit } from "@/lib/http-limits";

type Context = {
  params: Promise<{ channelId: string }>;
};

export async function POST(request: Request, context: Context) {
  const { channelId } = await context.params;
  const channel = await getTelegramChannel(channelId);
  if (!channel) {
    return new NextResponse("Not found", { status: 404 });
  }

  const expected =
    (channel.settings.webhookSecret as string | undefined) ??
    process.env.TELEGRAM_WEBHOOK_SECRET;
  if (
    !verifyTelegramSecret(
      request.headers.get("x-telegram-bot-api-secret-token"),
      expected,
    )
  ) {
    return new NextResponse("Invalid secret", { status: 401 });
  }

  const rawBody = await request.text();
  if (!isBodyWithinLimit(rawBody)) {
    return new NextResponse("Payload too large", { status: 413 });
  }

  const rateLimit = checkRateLimit(`webhook:telegram:${channelId}`);
  if (!rateLimit.allowed) {
    return new NextResponse("Rate limit exceeded", {
      status: 429,
      headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
    });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }
  const messages = normalizeTelegramPayload(channelId, payload);
  const results = [];
  for (const message of messages) {
    results.push(await processInboundMessage(message));
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
