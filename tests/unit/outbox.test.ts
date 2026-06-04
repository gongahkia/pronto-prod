import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { enqueueOutboundMessage, flushOutboundMessage } from "@/lib/channels/outbox";

describe("outbound message outbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enqueues outbound messages with an idempotency key", async () => {
    const db = {
      query: vi.fn().mockResolvedValueOnce({ rows: [outboundMessage()] }),
    };

    const result = await enqueueOutboundMessage(db, {
      clientId: "client-1",
      conversationId: "conversation-1",
      escalationId: "escalation-1",
      channelId: "channel-1",
      externalThreadId: "6590000000",
      body: "We will help.",
      idempotencyKey: "escalation-resolution:escalation-1",
      metadata: { purpose: "test" },
    });

    expect(result.id).toBe("outbound-1");
    expect(db.query.mock.calls[0][0]).toContain("on conflict (idempotency_key)");
    expect(db.query.mock.calls[0][1]).toEqual([
      "client-1",
      "conversation-1",
      "escalation-1",
      "channel-1",
      "6590000000",
      "We will help.",
      "escalation-resolution:escalation-1",
      { purpose: "test" },
    ]);
  });

  it("marks a pending outbound message sent after channel delivery succeeds", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [outboundMessage()] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await flushOutboundMessage("outbound-1");

    expect(mocks.sendChannelText).toHaveBeenCalledWith({
      channelId: "channel-1",
      externalThreadId: "6590000000",
      text: "We will help.",
    });
    expect(mocks.query.mock.calls[1][0]).toContain("status = 'sent'");
    expect(result).toEqual({ status: "sent", outboundMessageId: "outbound-1" });
  });

  it("marks a pending outbound message failed when channel delivery fails", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [outboundMessage()] })
      .mockResolvedValueOnce({ rows: [] });
    mocks.sendChannelText.mockRejectedValueOnce(new Error("WhatsApp send failed"));

    const result = await flushOutboundMessage("outbound-1");

    expect(mocks.query.mock.calls[1][0]).toContain("status = 'failed'");
    expect(mocks.query.mock.calls[1][1]).toEqual([
      "outbound-1",
      "WhatsApp send failed",
    ]);
    expect(result).toEqual({
      status: "failed",
      outboundMessageId: "outbound-1",
      error: "WhatsApp send failed",
    });
  });
});

function outboundMessage() {
  return {
    id: "outbound-1",
    client_id: "client-1",
    conversation_id: "conversation-1",
    escalation_id: "escalation-1",
    channel_id: "channel-1",
    external_thread_id: "6590000000",
    body: "We will help.",
    status: "pending",
    attempt_count: 0,
    last_error: null,
    idempotency_key: "escalation-resolution:escalation-1",
    metadata: {},
    created_at: new Date(),
    updated_at: new Date(),
    sent_at: null,
  };
}
