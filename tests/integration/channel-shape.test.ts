import { describe, expect, it } from "vitest";
import { normalizeTelegramPayload } from "@/lib/channels/telegram";
import { normalizeWhatsAppPayload } from "@/lib/channels/whatsapp";

describe("channel payloads map into the same internal conversation shape", () => {
  it("produces equivalent normalized fields for WhatsApp and Telegram", () => {
    const whatsapp = normalizeWhatsAppPayload("wa-channel", {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: "wa-1",
                    from: "6590000000",
                    type: "text",
                    text: { body: "Are you open today?" },
                  },
                ],
              },
            },
          ],
        },
      ],
    })[0];

    const telegram = normalizeTelegramPayload("tg-channel", {
      message: {
        message_id: 1,
        text: "Are you open today?",
        chat: { id: 6590000000 },
        from: { first_name: "Customer" },
      },
    })[0];

    expect(whatsapp.text).toBe(telegram.text);
    expect(whatsapp.externalThreadId).toBeTruthy();
    expect(telegram.externalThreadId).toBeTruthy();
    expect(whatsapp.customerHandle).toBeTruthy();
    expect(telegram.customerHandle).toBeTruthy();
  });
});

