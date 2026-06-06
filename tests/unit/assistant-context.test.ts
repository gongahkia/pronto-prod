import { describe, expect, it } from "vitest";
import { redactAssistantContextValue } from "@/lib/assistant/context";

describe("assistant context redaction", () => {
  it("redacts secrets before records can be sent to an LLM", () => {
    const redacted = redactAssistantContextValue({
      settings: {
        webhookSecret: "secret-value",
        nested: {
          accessToken: "token-value",
          visibleName: "WhatsApp",
        },
      },
      credentials: {
        apiKey: "key-value",
        phoneNumberId: "123",
      },
    });

    expect(redacted).toEqual({
      settings: {
        webhookSecret: "[redacted]",
        nested: {
          accessToken: "[redacted]",
          visibleName: "WhatsApp",
        },
      },
      credentials: "[redacted]",
    });
  });
});
