import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeInstagramPayload, sendInstagramText, verifyInstagramSignature } from "@/lib/channels/instagram";

describe("Instagram adapter", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it("normalizes text DMs", () => {
    const result = normalizeInstagramPayload("ig-channel", {
      entry: [
        {
          messaging: [
            {
              sender: { id: "ig-user" },
              message: { mid: "mid-ig", text: "hi" },
            },
          ],
        },
      ],
    });
    expect(result).toEqual([
      {
        channelId: "ig-channel",
        channelKind: "instagram",
        externalMessageId: "mid-ig",
        externalThreadId: "ig-user",
        customerHandle: "ig-user",
        text: "hi",
        unsupportedMediaType: undefined,
        raw: expect.any(Object),
      },
    ]);
  });

  it("skips echo messages", () => {
    const result = normalizeInstagramPayload("ig-channel", {
      entry: [
        {
          messaging: [
            {
              sender: { id: "ig-user" },
              message: { mid: "mid-ig", text: "echo", is_echo: true },
            },
          ],
        },
      ],
    });
    expect(result).toHaveLength(0);
  });

  it("flags story_mention as unsupported", () => {
    const [message] = normalizeInstagramPayload("ig-channel", {
      entry: [
        {
          messaging: [
            {
              sender: { id: "ig-user" },
              message: { mid: "mid-ig", story_mention: { id: "story-1" } },
            },
          ],
        },
      ],
    });
    expect(message.unsupportedMediaType).toBe("story_mention");
  });

  it("requires an app secret for webhook authenticity", () => {
    expect(verifyInstagramSignature("{}", null, undefined)).toBe(false);
  });

  it("sends to the customer ID with the configured professional account and Page token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message_id: "mid.out" }),
      { status: 200, headers: { "Content-Type": "application/json" } })));
    const result = await sendInstagramText({
      channel: { id: "ig-channel", client_id: "tenant-a", kind: "instagram", name: "Instagram",
        status: "active", external_id: "ig-business-a", credentials: { pageAccessToken: "page-token" },
        settings: {}, last_health_check_at: null, last_health_status: null, last_health_error: null,
        last_outbound_at: null, last_outbound_error: null },
      externalThreadId: "ig-customer-a", text: "Vegetarian noodles are available.",
    });
    expect(result).toBe("mid.out");
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain("/ig-business-a/messages");
    expect((options?.headers as Record<string, string>).Authorization).toBe("Bearer page-token");
    expect(JSON.parse(String(options?.body))).toMatchObject({ recipient: { id: "ig-customer-a" },
      message: { text: "Vegetarian noodles are available." } });
  });

  it("does not use a process-wide Page token for an unconfigured tenant", async () => {
    vi.stubEnv("INSTAGRAM_PAGE_ACCESS_TOKEN", "other-tenant-token");
    await expect(sendInstagramText({
      channel: { id: "ig-channel", client_id: "tenant-a", kind: "instagram", name: "Instagram",
        status: "active", external_id: "ig-business-a", credentials: {}, settings: {},
        last_health_check_at: null, last_health_status: null, last_health_error: null,
        last_outbound_at: null, last_outbound_error: null },
      externalThreadId: "ig-customer-a", text: "Hello",
    })).rejects.toThrow(/token.*missing/i);
  });

  it("treats a Graph transport timeout as uncertain acceptance", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timed out", "AbortError")));
    await expect(sendInstagramText({
      channel: { id: "ig-channel", client_id: "tenant-a", kind: "instagram", name: "Instagram",
        status: "active", external_id: "ig-business-a", credentials: { pageAccessToken: "token" }, settings: {},
        last_health_check_at: null, last_health_status: null, last_health_error: null,
        last_outbound_at: null, last_outbound_error: null },
      externalThreadId: "ig-customer-a", text: "Hello",
    })).rejects.toMatchObject({ name: "AmbiguousProviderAcceptanceError" });
  });
});
