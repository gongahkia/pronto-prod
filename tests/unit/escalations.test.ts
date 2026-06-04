import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Channel } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  sendChannelText: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  query: mocks.query,
}));

vi.mock("@/lib/channels/dispatch", () => ({
  sendChannelText: mocks.sendChannelText,
}));

vi.mock("@/lib/env", () => ({
  appBaseUrl: () => "https://example.test",
}));

import { notifyOwnerOfEscalation } from "@/lib/escalations";

describe("owner escalation notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks owner notifications as sent only after a configured send succeeds", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [escalation({ notificationPreference: "whatsapp" })] })
      .mockResolvedValueOnce({
        rows: [
          channel({ kind: "telegram", settings: { ownerChatId: "12345" } }),
          channel({
            id: "wa-channel",
            kind: "whatsapp",
            settings: { ownerPhone: "6590000000" },
          }),
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const result = await notifyOwnerOfEscalation("escalation-1");

    expect(mocks.sendChannelText).toHaveBeenCalledWith({
      channelId: "wa-channel",
      externalThreadId: "6590000000",
      text: expect.stringContaining(
        "https://example.test/operator/clients/client-1/conversations/conversation-1",
      ),
    });
    expect(mocks.query.mock.calls[2][1]).toEqual([
      "escalation-1",
      "sent",
      null,
    ]);
    expect(result.status).toBe("sent");
  });

  it("marks notifications as skipped when no owner destination is configured", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [escalation({ notificationPreference: "telegram" })] })
      .mockResolvedValueOnce({
        rows: [channel({ kind: "telegram", settings: {} })],
      })
      .mockResolvedValueOnce({ rows: [] });

    const result = await notifyOwnerOfEscalation("escalation-1");

    expect(mocks.sendChannelText).not.toHaveBeenCalled();
    expect(mocks.query.mock.calls[2][1]).toEqual([
      "escalation-1",
      "skipped",
      "No owner notification destination configured.",
    ]);
    expect(result.status).toBe("skipped");
  });

  it("records send failures without throwing", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [escalation({ notificationPreference: "telegram" })] })
      .mockResolvedValueOnce({
        rows: [channel({ kind: "telegram", settings: { ownerChatId: "12345" } })],
      })
      .mockResolvedValueOnce({ rows: [] });
    mocks.sendChannelText.mockRejectedValueOnce(new Error("Telegram send failed"));

    const result = await notifyOwnerOfEscalation("escalation-1");

    expect(result.status).toBe("failed");
    expect(mocks.query.mock.calls[2][1]).toEqual([
      "escalation-1",
      "failed",
      "Telegram send failed",
    ]);
  });
});

function escalation(businessProfile: Record<string, unknown>) {
  return {
    id: "escalation-1",
    reason_code: "human_handoff_requested",
    reason_detail: "Customer asked for human takeover.",
    customer_message: "Can we hop on a short call?",
    client_id: "client-1",
    conversation_id: "conversation-1",
    customer_handle: "6590000000",
    business_profile: businessProfile,
  };
}

function channel(overrides: Partial<Channel>): Channel {
  return {
    id: "channel-1",
    client_id: "client-1",
    kind: "telegram",
    name: "Channel",
    status: "active",
    external_id: null,
    credentials: {},
    settings: {},
    last_health_check_at: null,
    last_health_status: null,
    last_health_error: null,
    last_outbound_at: null,
    last_outbound_error: null,
    ...overrides,
  };
}
