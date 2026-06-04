import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runChannelHealthCheck } from "@/lib/channels/health";
import { sendWhatsAppText } from "@/lib/channels/whatsapp";
import type { Channel } from "@/lib/types";

describe("WhatsApp Graph API requests", () => {
  beforeEach(() => {
    vi.stubEnv("WHATSAPP_GRAPH_VERSION", "v99.0");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "phone-number-id" }),
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
    await runChannelHealthCheck(whatsappChannel());

    expect(fetch).toHaveBeenCalledWith(
      "https://graph.facebook.com/v99.0/phone-number-id?fields=id,display_phone_number,verified_name",
      expect.any(Object),
    );
  });

  it("fails outbound sends when credentials are missing", async () => {
    await expect(
      sendWhatsAppText({
        channel: whatsappChannel({ credentials: {}, external_id: null }),
        externalThreadId: "6590000000",
        text: "Hello",
      }),
    ).rejects.toThrow("WhatsApp credentials missing");
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
