import { describe, expect, it } from "vitest";
import { validateChannelHealthConfig } from "@/lib/channels/health";
import type { Channel } from "@/lib/types";

const baseChannel: Channel = {
  id: "channel-1",
  client_id: "client-1",
  kind: "telegram",
  name: "Telegram",
  status: "draft",
  external_id: null,
  credentials: {},
  settings: {},
  last_health_check_at: null,
  last_health_status: null,
  last_health_error: null,
  last_outbound_at: null,
  last_outbound_error: null,
};

describe("channel health config validation", () => {
  it("requires Telegram token and webhook secret", () => {
    expect(validateChannelHealthConfig(baseChannel)).toBe("Telegram bot token is missing.");
    expect(
      validateChannelHealthConfig({
        ...baseChannel,
        credentials: { botToken: "token" },
      }),
    ).toBe("Telegram webhook secret is missing.");
    expect(
      validateChannelHealthConfig({
        ...baseChannel,
        credentials: { botToken: "token" },
        settings: { webhookSecret: "secret" },
      }),
    ).toBeNull();
  });

  it("requires WhatsApp credentials and secrets", () => {
    const whatsapp: Channel = {
      ...baseChannel,
      kind: "whatsapp",
      name: "WhatsApp",
    };

    expect(validateChannelHealthConfig(whatsapp)).toBe("WhatsApp access token is missing.");
    expect(
      validateChannelHealthConfig({
        ...whatsapp,
        credentials: { accessToken: "token", phoneNumberId: "phone", appSecret: "secret" },
        settings: { verifyToken: "verify" },
      }),
    ).toBeNull();
  });
});
