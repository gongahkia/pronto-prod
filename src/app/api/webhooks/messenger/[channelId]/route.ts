import { assertSameOrigin } from "@/lib/http/csrf";
import { NextResponse } from "next/server";
import {
  getMessengerChannel,
  normalizeMessengerPayload,
  verifyMessengerSignature,
} from "@/lib/channels/messenger";
import { processWebhookBatch } from "@/lib/channels/webhook-batch";
import { checkRateLimit, isBodyWithinLimit } from "@/lib/http-limits";
import { requestIdFromRequest, requestIdHeaders } from "@/lib/logger";

type Context = {
  params: Promise<{ channelId: string }>;
};

export async function GET(request: Request, context: Context) {
  const { channelId } = await context.params;
  const channel = await getMessengerChannel(channelId);
  if (!channel) {
    return new NextResponse("Not found", { status: 404 });
  }

  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected =
    (channel.settings.verifyToken as string | undefined) ??
    process.env.MESSENGER_VERIFY_TOKEN;

  if (mode === "subscribe" && token === expected && challenge) {
    return new NextResponse(challenge);
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: Request, context: Context) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const requestId = requestIdFromRequest(request);
  const { channelId } = await context.params;
  const channel = await getMessengerChannel(channelId);
  if (!channel) {
    return new NextResponse("Not found", {
      status: 404,
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

  const rateLimit = await checkRateLimit(`webhook:messenger:${channelId}`);
  if (!rateLimit.allowed) {
    return new NextResponse("Rate limit exceeded", {
      status: 429,
      headers: requestIdHeaders(requestId, {
        "Retry-After": String(rateLimit.retryAfterSeconds),
      }),
    });
  }

  const appSecret =
    (channel.credentials.appSecret as string | undefined) ??
    process.env.MESSENGER_APP_SECRET;

  if (
    !verifyMessengerSignature(
      rawBody,
      request.headers.get("x-hub-signature-256"),
      appSecret,
    )
  ) {
    return new NextResponse("Invalid signature", {
      status: 401,
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
  const messages = normalizeMessengerPayload(channelId, payload);
  return NextResponse.json(await processWebhookBatch(messages, { requestId }), {
    headers: requestIdHeaders(requestId),
  });
}
