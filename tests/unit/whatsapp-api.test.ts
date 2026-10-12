import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runChannelHealthCheck } from "@/lib/channels/health";
import { sendWhatsAppText } from "@/lib/channels/whatsapp";
import { ProviderSendError } from "@/lib/channels/provider-error";
import type { Channel } from "@/lib/types";

describe("WhatsApp Graph API requests", () => {
  beforeEach(() => {
    vi.stubEnv("WHATSAPP_GRAPH_VERSION", "v99.0");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "phone-number-id", messages: [{ id: "wamid.outbound" }] }),
        text: async () => "",
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses the configured Graph version for outbound sends", async () => {
    await sendWhatsAppText({
      channel: whatsappChannel(),
      externalThreadId: "6590000000",
      text: "Hello",
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://graph.facebook.com/v99.0/phone-number-id/messages",
      expect.any(Object),
    );
  });

  it("uses the configured Graph version for health checks", async () => {
    expect(await runChannelHealthCheck(whatsappChannel())).toMatchObject({ status: "healthy" });

    expect(fetch).toHaveBeenCalledWith(
      "https://graph.facebook.com/v99.0/phone-number-id?fields=id,display_phone_number,verified_name",
      expect.any(Object),
    );
  });

  it("does not mark a different phone number as healthy", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "phone-other" }),
      { status: 200 })));
    expect(await runChannelHealthCheck(whatsappChannel())).toMatchObject({ status: "degraded" });
  });

  it("fails outbound sends when credentials are missing", async () => {
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "other-tenant-token");
    await expect(
      sendWhatsAppText({
        channel: whatsappChannel({ credentials: {}, external_id: null }),
        externalThreadId: "6590000000",
        text: "Hello",
      }),
    ).rejects.toThrow("WhatsApp credentials missing");
  });

  it("classifies rate limits for retry and credential rejection as permanent", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({ ok: false, status: 500 }));
    await expect(sendWhatsAppText({ channel: whatsappChannel(), externalThreadId: "6590000000", text: "Hello" }))
      .rejects.toMatchObject({ retryable: true, statusCode: 429 } satisfies Partial<ProviderSendError>);
    await expect(sendWhatsAppText({ channel: whatsappChannel(), externalThreadId: "6590000000", text: "Hello" }))
      .rejects.toMatchObject({ retryable: false, statusCode: 401 } satisfies Partial<ProviderSendError>);
    await expect(sendWhatsAppText({ channel: whatsappChannel(), externalThreadId: "6590000000", text: "Hello" }))
      .rejects.toMatchObject({ retryable: false, ambiguous: true, statusCode: 500 } satisfies Partial<ProviderSendError>);
  });

  it("treats transport failure after send was attempted as ambiguous", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network unavailable")));
    await expect(sendWhatsAppText({ channel: whatsappChannel(), externalThreadId: "6590000000", text: "Hello" }))
      .rejects.toMatchObject({ name: "AmbiguousProviderAcceptanceError" });
  });

  it("builds the actual template payload for approved WhatsApp messages", async () => {
    await sendWhatsAppText({ channel: whatsappChannel(), externalThreadId: "6590000000", text: "unused",
      template: { name: "approved_followup", languageCode: "en_US" } });
    const options = vi.mocked(fetch).mock.calls[0][1];
    const body = JSON.parse(String(options?.body));
    expect(body).toMatchObject({ type: "template", to: "6590000000",
      template: { name: "approved_followup", language: { code: "en_US" } } });
    expect(body.text).toBeUndefined();
  });
});

function whatsappChannel(overrides: Partial<Channel> = {}): Channel {
  return {
    id: "whatsapp-channel",
    client_id: "client-1",
    kind: "whatsapp",
    name: "WhatsApp",
    status: "active",
    external_id: null,
    credentials: {
      accessToken: "token",
      phoneNumberId: "phone-number-id",
      appSecret: "secret",
    },
    settings: { verifyToken: "verify" },
    last_health_check_at: null,
    last_health_status: null,
    last_health_error: null,
    last_outbound_at: null,
    last_outbound_error: null,
    ...overrides,
  };
}
