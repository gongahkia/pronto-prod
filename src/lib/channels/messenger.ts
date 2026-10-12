import { createHmac, timingSafeEqual } from "node:crypto";
import { query } from "@/lib/db";
import { decryptChannelCredentials, usesLegacyPlaintextCredentials } from "@/lib/channels/credentials";
import { fetchWithTimeout } from "@/lib/http/fetch";
import { AmbiguousProviderAcceptanceError, ProviderSendError } from "@/lib/channels/provider-error";
import { metaGraphVersion } from "@/lib/env";
import type { NormalizedInboundMessage } from "@/lib/channels/types";
import type { Channel } from "@/lib/types";

export function verifyMessengerSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string | undefined,
): boolean {
  if (!appSecret) return false;
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
  pageId?: string,
): NormalizedInboundMessage[] {
  const messages: NormalizedInboundMessage[] = [];
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    if (pageId && entry.id !== pageId) continue;
    const messaging = Array.isArray(entry.messaging) ? entry.messaging : [];
    for (const event of messaging) {
      if (!isRecord(event) || !isRecord(event.message) || !isRecord(event.sender)) continue;
      const message = event.message;
      const sender = event.sender;
      if (typeof sender.id !== "string" || typeof message.mid !== "string") continue;
      if (message.is_echo === true || (pageId && sender.id === pageId)) continue;
      if (pageId && (!isRecord(event.recipient) || event.recipient.id !== pageId)) continue;

      const text = typeof message.text === "string" ? message.text : null;
      const unsupportedMediaType = text ? undefined : messengerUnsupportedType(message);
      if (!text && !unsupportedMediaType) continue;

      messages.push({
        channelId,
        channelKind: "messenger",
        externalMessageId: message.mid,
        externalThreadId: sender.id,
        customerHandle: sender.id,
        ...(typeof event.timestamp === "number" && Number.isFinite(event.timestamp)
          ? { occurredAt: new Date(event.timestamp < 1_000_000_000_000
              ? event.timestamp * 1000 : event.timestamp).toISOString() } : {}),
        text: text ?? `[Unsupported Messenger ${unsupportedMediaType} message]`,
        unsupportedMediaType,
        raw: event,
      });
    }
  }
  return messages;
}

export function messengerPayloadMatchesChannel(payload: Record<string, unknown>, pageId: string): boolean {
  if (payload.object !== "page" || !pageId) return false;
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  return entries.length > 0 && entries.every((entry) => isRecord(entry) && entry.id === pageId &&
    (!Array.isArray(entry.messaging) || entry.messaging.every((event) =>
      !isRecord(event) || !isRecord(event.message) || event.message.is_echo === true ||
      (isRecord(event.sender) && event.sender.id === pageId) ||
      !isRecord(event.recipient) || event.recipient.id === pageId)));
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
}): Promise<string> {
  const token = input.channel.credentials.pageAccessToken as string | undefined;
  const pageId = (input.channel.credentials.pageId as string | undefined) ?? input.channel.external_id;
  if (!token || !pageId) {
    throw new Error("Messenger page credentials missing; outbound send skipped.");
  }

  let response: Response;
  try { response = await fetchWithTimeout(
    `https://graph.facebook.com/${metaGraphVersion()}/${pageId}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        recipient: { id: input.externalThreadId },
        message: { text: input.text },
        messaging_type: "RESPONSE",
      }),
    },
    channelFetchTimeoutMs(),
  ); } catch { throw new AmbiguousProviderAcceptanceError("Messenger"); }

  if (!response.ok) throw new ProviderSendError("Messenger", response.status);
  let body: { message_id?: unknown };
  try { body = await response.json() as typeof body; }
  catch { throw new AmbiguousProviderAcceptanceError("Messenger"); }
  if (typeof body.message_id !== "string") throw new AmbiguousProviderAcceptanceError("Messenger");
  return body.message_id;
}

function channelFetchTimeoutMs(): number {
  return Number(process.env.PRONTO_CHANNEL_FETCH_TIMEOUT_MS ?? 10_000);
}

export async function getMessengerChannel(channelId: string): Promise<Channel | null> {
  const result = await query<Channel>(
    "select * from channels where id = $1 and kind = 'messenger'",
    [channelId],
  );
  const row = result.rows[0];
  return row && !usesLegacyPlaintextCredentials(row) ? decryptChannelCredentials(row) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
