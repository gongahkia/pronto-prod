import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import {
  normalizeMessengerPayload,
  messengerPayloadMatchesChannel,
  sendMessengerText,
  verifyMessengerSignature,
} from "@/lib/channels/messenger";
import type { Channel } from "@/lib/types";

describe("Messenger adapter", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("normalizes a text message", () => {
    const payload = {
      entry: [
        {
          messaging: [
            {
              sender: { id: "user-1" },
              message: { mid: "mid-1", text: "hello" },
            },
          ],
        },
      ],
    };
    const result = normalizeMessengerPayload("channel-1", payload);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      channelId: "channel-1",
      channelKind: "messenger",
      externalMessageId: "mid-1",
      externalThreadId: "user-1",
      text: "hello",
    });
  });

  it("flags unsupported attachments", () => {
    const payload = {
      entry: [
        {
          messaging: [
            {
              sender: { id: "user-2" },
              message: { mid: "mid-2", attachments: [{ type: "image" }] },
            },
          ],
        },
      ],
    };
    const [message] = normalizeMessengerPayload("channel-1", payload);
    expect(message.unsupportedMediaType).toBe("image");
    expect(message.text).toContain("Unsupported");
  });

  it("verifies sha256 signatures", () => {
    const secret = "test-secret";
    const body = JSON.stringify({ entry: [] });
    const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    expect(verifyMessengerSignature(body, signature, secret)).toBe(true);
    expect(verifyMessengerSignature(body, "sha256=deadbeef", secret)).toBe(false);
    expect(verifyMessengerSignature(body, signature, undefined)).toBe(false);
  });

  it("binds a Page and rejects echo or wrong-recipient messages", () => {
    const payload = { object: "page", entry: [{ id: "page-a", messaging: [
      { sender: { id: "customer" }, recipient: { id: "page-a" }, timestamp: 1_760_000_000_000,
        message: { mid: "customer-1", text: "Hello" } },
      { sender: { id: "page-a" }, recipient: { id: "customer" },
        message: { mid: "echo-1", is_echo: true, text: "Hello" } },
    ] }] };
    expect(messengerPayloadMatchesChannel(payload, "page-a")).toBe(true);
    const customerOnly = { ...payload, entry: [{ ...payload.entry[0], messaging: [payload.entry[0].messaging[0]] }] };
    expect(messengerPayloadMatchesChannel(customerOnly, "page-a")).toBe(true);
    expect(messengerPayloadMatchesChannel(customerOnly, "page-b")).toBe(false);
    expect(messengerPayloadMatchesChannel({ object: "page", entry: [{ id: "page-a", messaging: [
      { sender: { id: "page-a" }, recipient: { id: "customer" }, delivery: { mids: ["mid"] } },
    ] }] }, "page-a")).toBe(true);
    expect(normalizeMessengerPayload("channel", payload, "page-a")).toMatchObject([
      { externalMessageId: "customer-1", occurredAt: new Date(1_760_000_000_000).toISOString() },
    ]);
  });

  it("sends with a bearer Page token and records the provider message ID", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message_id: "mid.sent" }))));
    const id = await sendMessengerText({ channel: messengerChannel(), externalThreadId: "customer", text: "Hello" });
    expect(id).toBe("mid.sent");
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toMatch(/graph\.facebook\.com\/v\d+\.\d+\/page-a\/messages/);
    expect(String(url)).not.toContain("access_token");
    expect(options?.headers).toMatchObject({ Authorization: "Bearer secret-page-token" });
  });

  it("classifies rate limits and ambiguous transport failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })));
    await expect(sendMessengerText({ channel: messengerChannel(), externalThreadId: "customer", text: "Hi" }))
      .rejects.toMatchObject({ name: "ProviderSendError", retryable: true });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("timeout"); }));
    await expect(sendMessengerText({ channel: messengerChannel(), externalThreadId: "customer", text: "Hi" }))
      .rejects.toMatchObject({ name: "AmbiguousProviderAcceptanceError" });
  });
});

function messengerChannel(): Channel {
  return { id: "channel", client_id: "tenant", kind: "messenger", name: "Page", status: "active",
    external_id: "page-a", settings: { verifyToken: "verify" },
    credentials: { pageAccessToken: "secret-page-token", appSecret: "app-secret" },
    last_health_check_at: null, last_health_status: null, last_health_error: null,
    last_outbound_at: null, last_outbound_error: null };
}
