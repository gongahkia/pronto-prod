import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import {
  normalizeEmailPayload,
  verifyEmailWebhookSignature,
} from "@/lib/channels/email";

describe("Email adapter", () => {
  it("normalizes Postmark inbound", () => {
    const result = normalizeEmailPayload("email-channel", "postmark", {
      MessageID: "msg-1",
      From: "alice@example.com",
      FromName: "Alice",
      Subject: "Re: order #1001",
      TextBody: "Where is my order?",
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      channelId: "email-channel",
      channelKind: "email",
      externalMessageId: "msg-1",
      customerHandle: "alice@example.com",
      customerName: "Alice",
      text: "Where is my order?",
    });
    expect(result[0].externalThreadId).toBe("order #1001");
  });

  it("normalizes Resend inbound", () => {
    const result = normalizeEmailPayload("email-channel", "resend", {
      data: {
        email_id: "rs-1",
        from: "bob@example.com",
        text: "hello there",
      },
    });
    expect(result[0]).toMatchObject({
      externalMessageId: "rs-1",
      customerHandle: "bob@example.com",
      text: "hello there",
    });
  });

  it("verifies HMAC signatures", () => {
    const secret = "wh-secret";
    const body = JSON.stringify({ MessageID: "x" });
    const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    expect(
      verifyEmailWebhookSignature({
        provider: "postmark",
        rawBody: body,
        signatureHeader: signature,
        secret,
      }),
    ).toBe(true);
    expect(
      verifyEmailWebhookSignature({
        provider: "postmark",
        rawBody: body,
        signatureHeader: "sha256=deadbeef",
        secret,
      }),
    ).toBe(false);
  });
});
