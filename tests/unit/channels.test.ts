import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  normalizeWhatsAppPayload,
  verifyWhatsAppSignature,
} from "@/lib/channels/whatsapp";
import {
  normalizeTelegramPayload,
  verifyTelegramSecret,
} from "@/lib/channels/telegram";

describe("channel verification and normalization", () => {
  it("verifies WhatsApp signatures", () => {
    const body = JSON.stringify({ ok: true });
    const secret = "super-secret";
    const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

    expect(verifyWhatsAppSignature(body, signature, secret)).toBe(true);
    expect(verifyWhatsAppSignature(body, "sha256=bad", secret)).toBe(false);
    expect(verifyWhatsAppSignature(body, signature, undefined)).toBe(false);
  });

  it("normalizes WhatsApp text messages", () => {
    const messages = normalizeWhatsAppPayload("channel-1", {
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ wa_id: "6590000000", profile: { name: "Alicia" } }],
                messages: [
                  {
                    id: "wamid.1",
                    from: "6590000000",
                    type: "text",
                    text: { body: "Are you open?" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      channelKind: "whatsapp",
      externalMessageId: "wamid.1",
      externalThreadId: "6590000000",
      customerName: "Alicia",
      text: "Are you open?",
    });
  });

  it("normalizes unsupported WhatsApp media into escalation-ready messages", () => {
    const messages = normalizeWhatsAppPayload("channel-1", {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: "wamid.image",
                    from: "6590000000",
                    type: "image",
                    image: { id: "media-1" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      text: "[Unsupported WhatsApp image message]",
      unsupportedMediaType: "image",
    });
  });

  it("verifies and normalizes Telegram webhook messages", () => {
    expect(verifyTelegramSecret("abc", "abc")).toBe(true);
    expect(verifyTelegramSecret("abc", "def")).toBe(false);

    const messages = normalizeTelegramPayload("channel-2", {
      message: {
        message_id: 88,
        text: "Can I reserve a table?",
        chat: { id: 12345 },
        from: { first_name: "Alicia", username: "alicia" },
      },
    });

    expect(messages[0]).toMatchObject({
      channelKind: "telegram",
      externalMessageId: "88",
      externalThreadId: "12345",
      customerHandle: "@alicia",
    });
  });

  it("normalizes unsupported Telegram media into escalation-ready messages", () => {
    const messages = normalizeTelegramPayload("channel-2", {
      message: {
        message_id: 89,
        photo: [{ file_id: "photo-1" }],
        chat: { id: 12345 },
        from: { first_name: "Alicia", username: "alicia" },
      },
    });

    expect(messages[0]).toMatchObject({
      text: "[Unsupported Telegram photo message]",
      unsupportedMediaType: "photo",
    });
  });
});
