import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  query: mocks.query,
}));

import {
  normalizeEmailPayload,
  parseEmailPayload,
  stripHtml,
  verifyEmailWebhookSignature,
} from "@/lib/channels/email";
import { classifyEmailEvent } from "@/lib/channels/email-events";

beforeEach(() => {
  mocks.query.mockReset();
  mocks.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Email adapter — Postmark inbound", () => {
  it("normalizes plain text + uses RFC Message-Id when present", async () => {
    const result = await normalizeEmailPayload("email-channel", "postmark", {
      MessageID: "provider-1",
      From: "Alice <alice@example.com>",
      FromName: "Alice",
      Subject: "Re: order #1001",
      TextBody: "Where is my order?",
      Headers: [
        { Name: "Message-Id", Value: "<rfc-1@example.com>" },
        { Name: "Authentication-Results", Value: "spf=pass dkim=pass dmarc=pass" },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      externalMessageId: "rfc-1@example.com",
      customerHandle: "alice@example.com",
      customerName: "Alice",
      text: "Where is my order?",
    });
  });

  it("resolves threading via In-Reply-To against a previous customer message", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [{ external_thread_id: "thread-abc" }],
      rowCount: 1,
    });
    const result = await normalizeEmailPayload("email-channel", "postmark", {
      MessageID: "provider-2",
      From: "alice@example.com",
      Subject: "Re: order",
      TextBody: "Following up",
      Headers: [
        { Name: "Message-Id", Value: "<rfc-2@example.com>" },
        { Name: "In-Reply-To", Value: "<rfc-1@example.com>" },
        { Name: "References", Value: "<rfc-0@example.com> <rfc-1@example.com>" },
      ],
    });
    expect(result[0].externalThreadId).toBe("thread-abc");
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining("from conversations c"),
      expect.arrayContaining(["email-channel"]),
    );
  });

  it("falls back to In-Reply-To when DB has no match", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const result = await normalizeEmailPayload("email-channel", "postmark", {
      MessageID: "provider-3",
      From: "alice@example.com",
      Subject: "Re: order",
      TextBody: "Hi",
      Headers: [
        { Name: "Message-Id", Value: "<rfc-3@example.com>" },
        { Name: "In-Reply-To", Value: "<earlier@example.com>" },
      ],
    });
    expect(result[0].externalThreadId).toBe("earlier@example.com");
  });

  it("skips auto-responders by Auto-Submitted header", async () => {
    const result = await normalizeEmailPayload("email-channel", "postmark", {
      MessageID: "provider-auto",
      From: "alice@example.com",
      Subject: "Out of office",
      TextBody: "I am away.",
      Headers: [{ Name: "Auto-Submitted", Value: "auto-replied" }],
    });
    expect(result).toHaveLength(0);
  });

  it("skips bulk/list precedence", async () => {
    const result = await normalizeEmailPayload("email-channel", "postmark", {
      MessageID: "provider-bulk",
      From: "newsletter@example.com",
      Subject: "Weekly digest",
      TextBody: "...",
      Headers: [{ Name: "Precedence", Value: "bulk" }],
    });
    expect(result).toHaveLength(0);
  });

  it("flags attachment-only messages as unsupported_media", async () => {
    const result = await normalizeEmailPayload("email-channel", "postmark", {
      MessageID: "provider-att",
      From: "alice@example.com",
      Subject: "Receipt",
      TextBody: "",
      Attachments: [{ Name: "receipt.pdf", ContentType: "application/pdf", ContentLength: 1234 }],
      Headers: [{ Name: "Message-Id", Value: "<rfc-att@example.com>" }],
    });
    expect(result[0].unsupportedMediaType).toBe("email_attachment");
    expect(result[0].text).toContain("receipt.pdf");
  });

  it("falls back to HtmlBody when TextBody is empty", async () => {
    const result = await normalizeEmailPayload("email-channel", "postmark", {
      MessageID: "provider-html",
      From: "alice@example.com",
      Subject: "Hi",
      HtmlBody: "<p>Hello <b>world</b></p>",
      Headers: [{ Name: "Message-Id", Value: "<rfc-html@example.com>" }],
    });
    expect(result[0].text).toContain("Hello world");
  });

  it("flags DMARC fail as unsupported_media", async () => {
    const result = await normalizeEmailPayload("email-channel", "postmark", {
      MessageID: "provider-dmarc",
      From: "spoof@example.com",
      Subject: "Re: order",
      TextBody: "Suspicious content",
      Headers: [
        { Name: "Message-Id", Value: "<rfc-d@example.com>" },
        { Name: "Authentication-Results", Value: "spf=fail dkim=fail dmarc=fail" },
      ],
    });
    expect(result[0].unsupportedMediaType).toBe("email_auth_failed");
  });
});

describe("Email adapter — Resend inbound", () => {
  it("normalizes Resend payloads", async () => {
    const result = await normalizeEmailPayload("email-channel", "resend", {
      data: {
        email_id: "rs-1",
        from: "Bob <bob@example.com>",
        subject: "hi",
        text: "hello there",
        headers: { "message-id": "<rfc-rs-1@example.com>" },
      },
    });
    expect(result[0]).toMatchObject({
      externalMessageId: "rfc-rs-1@example.com",
      customerHandle: "bob@example.com",
      text: "hello there",
    });
  });
});

describe("Email adapter — pure helpers", () => {
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

  it("parses Postmark headers + extracts addresses", () => {
    const parsed = parseEmailPayload("postmark", {
      MessageID: "p",
      From: "ALICE@example.com",
      Subject: "Hi",
      TextBody: "Hi",
      Headers: [{ Name: "Message-Id", Value: "<m1@example.com>" }],
    });
    expect(parsed?.fromAddress).toBe("alice@example.com");
    expect(parsed?.headers.messageId).toBe("m1@example.com");
  });

  it("strips html into readable text", () => {
    const text = stripHtml("<p>Hello <strong>world</strong>!</p><script>x</script>");
    expect(text).toBe("Hello world!");
  });
});

describe("Email events", () => {
  it("classifies Postmark hard bounce", () => {
    const event = classifyEmailEvent("postmark", {
      RecordType: "HardBounce",
      Email: "Bob@example.com",
      Description: "Mailbox not found",
    });
    expect(event).toEqual({
      kind: "bounce",
      emailAddress: "bob@example.com",
      reason: "Mailbox not found",
    });
  });

  it("classifies Postmark spam complaint", () => {
    const event = classifyEmailEvent("postmark", {
      RecordType: "SpamComplaint",
      Email: "carol@example.com",
    });
    expect(event.kind).toBe("complaint");
    expect(event.emailAddress).toBe("carol@example.com");
  });

  it("classifies Resend bounced event", () => {
    const event = classifyEmailEvent("resend", {
      type: "email.bounced",
      data: { to: ["dave@example.com"], bounce: { reason: "permanent" } },
    });
    expect(event).toEqual({
      kind: "bounce",
      emailAddress: "dave@example.com",
      reason: "permanent",
    });
  });

  it("ignores unrelated event types", () => {
    expect(classifyEmailEvent("postmark", { RecordType: "Open" }).kind).toBe("ignored");
    expect(classifyEmailEvent("resend", { type: "email.opened" }).kind).toBe("ignored");
  });
});
