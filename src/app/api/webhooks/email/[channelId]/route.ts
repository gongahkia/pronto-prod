import { NextResponse } from "next/server";
import {
  getEmailChannel,
  normalizeEmailPayload,
  verifyEmailWebhookSignature,
  type EmailProviderKind,
} from "@/lib/channels/email";
import { processWebhookBatch } from "@/lib/channels/webhook-batch";
import { checkRateLimit, isBodyWithinLimit } from "@/lib/http-limits";
import { requestIdFromRequest, requestIdHeaders } from "@/lib/logger";

type Context = {
  params: Promise<{ channelId: string }>;
};

export async function POST(request: Request, context: Context) {
  const requestId = requestIdFromRequest(request);
  const { channelId } = await context.params;
  const channel = await getEmailChannel(channelId);
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

  const rateLimit = await checkRateLimit(`webhook:email:${channelId}`);
  if (!rateLimit.allowed) {
    return new NextResponse("Rate limit exceeded", {
      status: 429,
      headers: requestIdHeaders(requestId, {
        "Retry-After": String(rateLimit.retryAfterSeconds),
      }),
    });
  }

  const provider =
    ((channel.credentials.provider as string | undefined) as EmailProviderKind | undefined) ??
    "postmark";
  const secret =
    (channel.settings.webhookSecret as string | undefined) ??
    (provider === "postmark"
      ? process.env.POSTMARK_WEBHOOK_SECRET
      : process.env.RESEND_WEBHOOK_SECRET);

  const signatureHeader =
    request.headers.get("x-pronto-signature") ??
    request.headers.get("svix-signature") ??
    request.headers.get("x-resend-signature");

  if (
    !verifyEmailWebhookSignature({
      provider,
      rawBody,
      signatureHeader,
      secret,
    })
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
  const messages = await normalizeEmailPayload(channelId, provider, payload);
  return NextResponse.json(await processWebhookBatch(messages, { requestId }), {
    headers: requestIdHeaders(requestId),
  });
}
