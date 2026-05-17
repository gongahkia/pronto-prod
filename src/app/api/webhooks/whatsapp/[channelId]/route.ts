import { NextResponse } from "next/server";
import { processInboundMessage } from "@/lib/channels/process";
import {
  getWhatsAppChannel,
  normalizeWhatsAppPayload,
  verifyWhatsAppSignature,
} from "@/lib/channels/whatsapp";
import { checkRateLimit, isBodyWithinLimit } from "@/lib/http-limits";

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
  if (!isBodyWithinLimit(rawBody)) {
    return new NextResponse("Payload too large", { status: 413 });
  }

  const rateLimit = checkRateLimit(`webhook:whatsapp:${channelId}`);
  if (!rateLimit.allowed) {
    return new NextResponse("Rate limit exceeded", {
      status: 429,
      headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
    });
  }

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

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }
  const messages = normalizeWhatsAppPayload(channelId, payload);
  const results = [];
  for (const message of messages) {
    results.push(await processInboundMessage(message));
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
