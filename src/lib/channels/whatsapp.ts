import { createHmac, timingSafeEqual } from "node:crypto";
import { query } from "@/lib/db";
import { decryptChannelCredentials, usesLegacyPlaintextCredentials } from "@/lib/channels/credentials";
import { whatsAppGraphVersion } from "@/lib/env";
import { fetchWithTimeout } from "@/lib/http/fetch";
import { AmbiguousProviderAcceptanceError, ProviderSendError } from "@/lib/channels/provider-error";
import type { NormalizedInboundMessage } from "@/lib/channels/types";
import type { Channel } from "@/lib/types";

export function verifyWhatsAppSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string | undefined,
): boolean {
  if (!appSecret) {
    return false;
  }
  if (!signatureHeader?.startsWith("sha256=")) {
    return false;
  }

  const expected = createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");
  const provided = signatureHeader.slice("sha256=".length);
  const expectedBuffer = Buffer.from(expected, "hex");
  const providedBuffer = Buffer.from(provided, "hex");

  return (
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

export function whatsAppPayloadMatchesChannel(payload: Record<string, unknown>, phoneNumberId: string): boolean {
  if (payload.object !== "whatsapp_business_account" || !phoneNumberId) return false;
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  if (!entries.length) return false;
  for (const entry of entries) {
    if (!isRecord(entry) || !Array.isArray(entry.changes)) return false;
    for (const change of entry.changes) {
      if (!isRecord(change) || !isRecord(change.value) || !isRecord(change.value.metadata) ||
        change.value.metadata.phone_number_id !== phoneNumberId) return false;
    }
  }
  return true;
}

export function normalizeWhatsAppPayload(
  channelId: string,
  payload: Record<string, unknown>,
): NormalizedInboundMessage[] {
  const messages: NormalizedInboundMessage[] = [];
  const entries = Array.isArray(payload.entry) ? payload.entry : [];

  for (const entry of entries) {
    const changes = isRecord(entry) && Array.isArray(entry.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = isRecord(change) && isRecord(change.value) ? change.value : {};
      const contacts = new Map<string, string>();
      const valueContacts = Array.isArray(value.contacts) ? value.contacts : [];
      for (const contact of valueContacts) {
        if (!isRecord(contact) || typeof contact.wa_id !== "string") {
          continue;
        }
        const profile = isRecord(contact.profile) ? contact.profile : {};
        contacts.set(
          contact.wa_id,
          typeof profile.name === "string" ? profile.name : contact.wa_id,
        );
      }

      const valueMessages = Array.isArray(value.messages) ? value.messages : [];
      for (const message of valueMessages) {
        if (!isRecord(message)) {
          continue;
        }
        if (
          typeof message.id !== "string" ||
          typeof message.from !== "string" ||
          typeof message.type !== "string"
        ) {
          continue;
        }

        const body =
          message.type === "text" && isRecord(message.text)
            ? message.text.body
            : `[Unsupported WhatsApp ${message.type} message]`;
        if (typeof body !== "string") {
          continue;
        }

        messages.push({
          channelId,
          channelKind: "whatsapp",
          externalMessageId: message.id,
          externalThreadId: message.from,
          customerHandle: message.from,
          customerName: contacts.get(message.from),
          text: body,
          unsupportedMediaType: message.type === "text" ? undefined : message.type,
          raw: message,
        });
      }
    }
  }

  return messages;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function sendWhatsAppText(input: {
  channel: Channel;
  externalThreadId: string;
  text: string;
  template?: { name: string; languageCode: string };
}): Promise<string> {
  const token =
    (input.channel.credentials.accessToken as string | undefined) ??
    process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId =
    (input.channel.credentials.phoneNumberId as string | undefined) ??
    input.channel.external_id;

  if (!token || !phoneNumberId) {
    throw new Error("WhatsApp credentials missing; outbound send skipped.");
  }

  const response = await fetchWithTimeout(
    `https://graph.facebook.com/${whatsAppGraphVersion()}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: input.externalThreadId,
        ...(input.template
          ? { type: "template", template: { name: input.template.name,
              language: { code: input.template.languageCode } } }
          : { type: "text", text: { preview_url: false, body: input.text } }),
      }),
    },
    channelFetchTimeoutMs(),
  );

  if (!response.ok) {
    throw new ProviderSendError("WhatsApp", response.status);
  }
  const body = (await response.json()) as { messages?: Array<{ id?: unknown }> };
  if (typeof body.messages?.[0]?.id !== "string") throw new AmbiguousProviderAcceptanceError("WhatsApp");
  return body.messages[0].id;
}

function channelFetchTimeoutMs(): number {
  return Number(process.env.PRONTO_CHANNEL_FETCH_TIMEOUT_MS ?? 10_000);
}

export async function getWhatsAppChannel(channelId: string): Promise<Channel | null> {
  const result = await query<Channel>(
    "select * from channels where id = $1 and kind = 'whatsapp'",
    [channelId],
  );
  const row = result.rows[0];
  return row && !usesLegacyPlaintextCredentials(row) ? decryptChannelCredentials(row) : null;
}
