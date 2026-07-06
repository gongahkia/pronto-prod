import { describe, expect, it } from "vitest";
import {
  PROACTIVE_WHATSAPP_PURPOSE,
  assertChannelSendAllowed,
  policyFromOutboundMetadata,
} from "@/lib/channels/policy";
import type { Channel } from "@/lib/types";

describe("channel send policy", () => {
  it("blocks proactive WhatsApp sends unless an approved template path is present", () => {
    expect(() =>
      assertChannelSendAllowed(whatsappChannel(), {
        purpose: PROACTIVE_WHATSAPP_PURPOSE,
      }),
    ).toThrow("approved message template");

    expect(() =>
      assertChannelSendAllowed(whatsappChannel(), {
        purpose: PROACTIVE_WHATSAPP_PURPOSE,
        whatsappTemplateName: "order_update",
        whatsappTemplateApproved: true,
      }),
    ).not.toThrow();
  });

  it("does not block normal customer-thread replies or non-WhatsApp sends", () => {
    expect(() => assertChannelSendAllowed(whatsappChannel())).not.toThrow();
    expect(() =>
      assertChannelSendAllowed(telegramChannel(), {
        purpose: PROACTIVE_WHATSAPP_PURPOSE,
      }),
    ).not.toThrow();
  });

  it("builds policy only for proactive or template-aware outbound metadata", () => {
    expect(policyFromOutboundMetadata({ purpose: "escalation_resolution_reply" }))
      .toBeUndefined();
    expect(
      policyFromOutboundMetadata({
        purpose: PROACTIVE_WHATSAPP_PURPOSE,
        whatsappTemplateName: "appointment_reminder",
        whatsappTemplateApproved: false,
      }),
    ).toEqual({
      purpose: PROACTIVE_WHATSAPP_PURPOSE,
      whatsappTemplateName: "appointment_reminder",
      whatsappTemplateApproved: false,
    });
  });
});

function whatsappChannel(): Channel {
  return {
    ...baseChannel(),
    kind: "whatsapp",
    name: "WhatsApp",
  };
}

function telegramChannel(): Channel {
  return {
    ...baseChannel(),
    kind: "telegram",
    name: "Telegram",
  };
}

function baseChannel(): Channel {
  return {
    id: "channel-1",
    client_id: "client-1",
    kind: "email",
    name: "Email",
    status: "active",
    external_id: null,
    credentials: {},
    settings: {},
    last_health_check_at: null,
    last_health_status: null,
    last_health_error: null,
    last_outbound_at: null,
    last_outbound_error: null,
  };
}
