import { NextResponse } from "next/server";
import {
  getTelegramChannel,
  normalizeTelegramPayload,
  verifyTelegramSecret,
} from "@/lib/channels/telegram";
import { processInboundMessages } from "@/lib/channels/process";
import { isBodyWithinLimit } from "@/lib/http-limits";
import { requestIdFromRequest, requestIdHeaders } from "@/lib/logger";

type Context = {
  params: Promise<{ channelId: string }>;
};

export async function POST(request: Request, context: Context) {
  const requestId = requestIdFromRequest(request);
  const { channelId } = await context.params;
  const channel = await getTelegramChannel(channelId);
  if (!channel) {
    return new NextResponse("Not found", {
      status: 404,
      headers: requestIdHeaders(requestId),
    });
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
    return new NextResponse("Invalid secret", {
      status: 401,
      headers: requestIdHeaders(requestId),
    });
  }

  const rawBody = await request.text();
  if (!isBodyWithinLimit(rawBody)) {
    return new NextResponse("Payload too large", {
      status: 413,
      headers: requestIdHeaders(requestId),
    });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Invalid JSON", {
      status: 400,
      headers: requestIdHeaders(requestId),
    });
  }
  const messages = normalizeTelegramPayload(channelId, payload);
  return NextResponse.json(await processInboundMessages(messages, { requestId }), {
    headers: requestIdHeaders(requestId),
  });
}
