import { createHmac, timingSafeEqual } from "node:crypto";
import { query } from "@/lib/db";
import { redactErrorMessage } from "@/lib/logger";
import type { NormalizedInboundMessage } from "@/lib/channels/types";
import type { Channel } from "@/lib/types";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? "v20.0";

export function verifyMessengerSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string | undefined,
): boolean {
  if (!appSecret) {
    return process.env.NODE_ENV !== "production";
  }
  if (!signatureHeader?.startsWith("sha256=")) {
    return false;
  }
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const provided = signatureHeader.slice("sha256=".length);
  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(provided, "hex");
  return (
    expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf)
  );
}

export function normalizeMessengerPayload(
  channelId: string,
  payload: Record<string, unknown>,
): NormalizedInboundMessage[] {
  const messages: NormalizedInboundMessage[] = [];
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    const messaging = Array.isArray(entry.messaging) ? entry.messaging : [];
    for (const event of messaging) {
      if (!isRecord(event) || !isRecord(event.message) || !isRecord(event.sender)) continue;
      const message = event.message;
      const sender = event.sender;
      if (typeof sender.id !== "string" || typeof message.mid !== "string") continue;

      const text = typeof message.text === "string" ? message.text : null;
      const unsupportedMediaType = text ? undefined : messengerUnsupportedType(message);
      if (!text && !unsupportedMediaType) continue;

      messages.push({
        channelId,
        channelKind: "messenger",
        externalMessageId: message.mid,
        externalThreadId: sender.id,
        customerHandle: sender.id,
        text: text ?? `[Unsupported Messenger ${unsupportedMediaType} message]`,
        unsupportedMediaType,
        raw: event,
      });
    }
  }
  return messages;
}

function messengerUnsupportedType(message: Record<string, unknown>): string | undefined {
  if (Array.isArray(message.attachments) && message.attachments.length > 0) {
    const first = message.attachments[0];
    if (isRecord(first) && typeof first.type === "string") {
      return first.type;
    }
    return "attachment";
  }
  return undefined;
}

export async function sendMessengerText(input: {
  channel: Channel;
  externalThreadId: string;
  text: string;
}): Promise<void> {
  const token =
    (input.channel.credentials.pageAccessToken as string | undefined) ??
    process.env.MESSENGER_PAGE_ACCESS_TOKEN;
  if (!token) {
    throw new Error("Messenger page access token missing; outbound send skipped.");
  }

  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/me/messages?access_token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: input.externalThreadId },
        message: { text: input.text },
        messaging_type: "RESPONSE",
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(redactErrorMessage(`Messenger send failed: ${response.status} ${body}`));
  }
}

export async function getMessengerChannel(channelId: string): Promise<Channel | null> {
  const result = await query<Channel>(
    "select * from channels where id = $1 and kind = 'messenger'",
    [channelId],
  );
  return result.rows[0] ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
