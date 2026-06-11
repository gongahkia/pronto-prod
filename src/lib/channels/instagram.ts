import { createHmac, timingSafeEqual } from "node:crypto";
import { query } from "@/lib/db";
import { redactErrorMessage } from "@/lib/logger";
import type { NormalizedInboundMessage } from "@/lib/channels/types";
import type { Channel } from "@/lib/types";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? "v20.0";

export function verifyInstagramSignature(
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

export function normalizeInstagramPayload(
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
      if (message.is_echo === true) continue;

      const text = typeof message.text === "string" ? message.text : null;
      const unsupportedMediaType = text ? undefined : instagramUnsupportedType(message);
      if (!text && !unsupportedMediaType) continue;

      messages.push({
        channelId,
        channelKind: "instagram",
        externalMessageId: message.mid,
        externalThreadId: sender.id,
        customerHandle: sender.id,
        text: text ?? `[Unsupported Instagram ${unsupportedMediaType} message]`,
        unsupportedMediaType,
        raw: event,
      });
    }
  }
  return messages;
}

function instagramUnsupportedType(message: Record<string, unknown>): string | undefined {
  if (Array.isArray(message.attachments) && message.attachments.length > 0) {
    const first = message.attachments[0];
    if (isRecord(first) && typeof first.type === "string") return first.type;
    return "attachment";
  }
  if (isRecord(message.reaction)) return "reaction";
  if (isRecord(message.story_mention)) return "story_mention";
  return undefined;
}

export async function sendInstagramText(input: {
  channel: Channel;
  externalThreadId: string;
  text: string;
}): Promise<void> {
  const token =
    (input.channel.credentials.pageAccessToken as string | undefined) ??
    process.env.INSTAGRAM_PAGE_ACCESS_TOKEN;
  const igUserId =
    (input.channel.credentials.igUserId as string | undefined) ??
    input.channel.external_id;
  if (!token || !igUserId) {
    throw new Error("Instagram page access token or IG user ID missing; outbound send skipped.");
  }

  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${igUserId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipient: { id: input.externalThreadId },
        message: { text: input.text },
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(redactErrorMessage(`Instagram send failed: ${response.status} ${body}`));
  }
}

export async function getInstagramChannel(channelId: string): Promise<Channel | null> {
  const result = await query<Channel>(
    "select * from channels where id = $1 and kind = 'instagram'",
    [channelId],
  );
  return result.rows[0] ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
