import { createHmac, timingSafeEqual } from "node:crypto";
import { query } from "@/lib/db";
import type { NormalizedInboundMessage } from "@/lib/channels/types";
import type { Channel } from "@/lib/types";

export function verifyWhatsAppSignature(
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
        if (!isRecord(message) || message.type !== "text" || !isRecord(message.text)) {
          continue;
        }
        const body = message.text.body;
        if (
          typeof message.id !== "string" ||
          typeof message.from !== "string" ||
          typeof body !== "string"
        ) {
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
}): Promise<void> {
  const token =
    (input.channel.credentials.accessToken as string | undefined) ??
    process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId =
    (input.channel.credentials.phoneNumberId as string | undefined) ??
    input.channel.external_id;

  if (!token || !phoneNumberId) {
    console.warn("WhatsApp credentials missing; skipping outbound send.");
    return;
  }

  const response = await fetch(
    `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: input.externalThreadId,
        type: "text",
        text: {
          preview_url: false,
          body: input.text,
        },
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`WhatsApp send failed: ${response.status} ${body}`);
  }
}

export async function getWhatsAppChannel(channelId: string): Promise<Channel | null> {
  const result = await query<Channel>(
    "select * from channels where id = $1 and kind = 'whatsapp'",
    [channelId],
  );
  return result.rows[0] ?? null;
}
