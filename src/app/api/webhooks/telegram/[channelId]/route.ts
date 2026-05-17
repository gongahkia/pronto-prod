import { NextResponse } from "next/server";
import { processInboundMessage } from "@/lib/channels/process";
import {
  getTelegramChannel,
  normalizeTelegramPayload,
  verifyTelegramSecret,
} from "@/lib/channels/telegram";

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

  const payload = await request.json();
  const messages = normalizeTelegramPayload(channelId, payload);
  const results = [];
  for (const message of messages) {
    results.push(await processInboundMessage(message));
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}

