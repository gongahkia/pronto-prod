import { NextResponse } from "next/server";
import { processInboundMessage } from "@/lib/channels/process";
import {
  getWhatsAppChannel,
  normalizeWhatsAppPayload,
  verifyWhatsAppSignature,
} from "@/lib/channels/whatsapp";

type Context = {
  params: Promise<{ channelId: string }>;
};

export async function GET(request: Request, context: Context) {
  const { channelId } = await context.params;
  const channel = await getWhatsAppChannel(channelId);
  if (!channel) {
    return new NextResponse("Not found", { status: 404 });
  }

  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected =
    (channel.settings.verifyToken as string | undefined) ??
    process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && token === expected && challenge) {
    return new NextResponse(challenge);
  }

  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: Request, context: Context) {
  const { channelId } = await context.params;
  const channel = await getWhatsAppChannel(channelId);
  if (!channel) {
    return new NextResponse("Not found", { status: 404 });
  }

  const rawBody = await request.text();
  const appSecret =
    (channel.credentials.appSecret as string | undefined) ??
    process.env.WHATSAPP_APP_SECRET;

  if (
    !verifyWhatsAppSignature(
      rawBody,
      request.headers.get("x-hub-signature-256"),
      appSecret,
    )
  ) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  const payload = JSON.parse(rawBody);
  const messages = normalizeWhatsAppPayload(channelId, payload);
  const results = [];
  for (const message of messages) {
    results.push(await processInboundMessage(message));
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}

