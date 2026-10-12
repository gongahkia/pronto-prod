import { NextResponse } from "next/server";
import {
  getEmailChannel,
  normalizeEmailPayload,
  verifyEmailWebhookSignature,
  type EmailProviderKind,
} from "@/lib/channels/email";
import { processInboundMessages } from "@/lib/channels/process";
import { isBodyWithinLimit } from "@/lib/http-limits";
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
  if (channel.status !== "active") return new NextResponse("Channel inactive", { status: 403, headers: requestIdHeaders(requestId) });

  const rawBody = await request.text();
  if (!isBodyWithinLimit(rawBody)) {
    return new NextResponse("Payload too large", {
      status: 413,
      headers: requestIdHeaders(requestId),
    });
  }

  const provider =
    ((channel.credentials.provider as string | undefined) as EmailProviderKind | undefined) ??
    "postmark";
  if (provider === "local_smtp") return new NextResponse("Local email has no public webhook", { status: 403, headers: requestIdHeaders(requestId) });
  const secret = channel.settings.webhookSecret as string | undefined;

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
  const supportAddress = channel.credentials.fromAddress as string | undefined;
  if (!supportAddress) return new NextResponse("Support address missing", { status: 503, headers: requestIdHeaders(requestId) });
  const messages = await normalizeEmailPayload(channelId, provider, payload, supportAddress);
  return NextResponse.json(await processInboundMessages(messages, { requestId }), {
    headers: requestIdHeaders(requestId),
  });
}
