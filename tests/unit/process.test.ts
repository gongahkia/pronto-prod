import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ESCALATION_HOLDING_REPLY } from "@/lib/channels/escalation-handoff";
import type { Channel } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  transaction: vi.fn(),
  runAgentForMessage: vi.fn(),
  createEscalation: vi.fn(),
  enqueueOutboundMessage: vi.fn(),
  flushOutboundMessage: vi.fn(),
  notifyOwnerOfEscalation: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  query: mocks.query,
  transaction: mocks.transaction,
}));

vi.mock("@/lib/agent/engine", () => ({
  runAgentForMessage: mocks.runAgentForMessage,
  createEscalation: mocks.createEscalation,
}));

vi.mock("@/lib/channels/outbox", () => ({
  enqueueOutboundMessage: mocks.enqueueOutboundMessage,
  flushOutboundMessage: mocks.flushOutboundMessage,
}));

vi.mock("@/lib/escalations", () => ({
  notifyOwnerOfEscalation: mocks.notifyOwnerOfEscalation,
}));

vi.mock("@/lib/logger", () => ({
  logInfo: mocks.logInfo,
  logWarn: mocks.logWarn,
  redactErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
}));

import { processInboundMessage } from "@/lib/channels/process";

describe("inbound channel processing", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.transaction.mockImplementation(async (callback) => {
      const client = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes("insert into conversations")) {
            return { rows: [{ id: "conversation-1" }] };
          }
          if (sql.includes("insert into messages")) {
            return { rows: [{ id: "customer-message-1" }] };
          }
          return { rows: [] };
        }),
      };

      return callback(client);
    });
    mocks.enqueueOutboundMessage.mockResolvedValue({ id: "outbound-1" });
    mocks.flushOutboundMessage.mockResolvedValue({
      status: "sent",
      outboundMessageId: "outbound-1",
    });
    mocks.runAgentForMessage.mockResolvedValue({
      action: "escalated",
      responseText: null,
      reasonCode: "transactional_action",
      reasonDetail: "Human owner required.",
      confidence: 1,
      citedChunks: [],
      escalationId: "escalation-1",
    });
  });

  it("sends and records configured WhatsApp holding replies on escalation", async () => {
    setupChannel({
      settings: {
        escalationHoldingReply: "Team Pronto will take over from here.",
      },
    });

    await processInboundMessage(inboundWhatsAppMessage(), {
      requestId: "req_12345678",
    });

    expect(mocks.runAgentForMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req_12345678",
      }),
    );
    expect(mocks.enqueueOutboundMessage).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        clientId: "client-1",
        channelId: "whatsapp-channel-1",
        externalThreadId: "6590000000",
        body: "Team Pronto will take over from here.",
        idempotencyKey: "escalation-holding:escalation-1",
      }),
    );
    expect(mocks.notifyOwnerOfEscalation).toHaveBeenCalledWith("escalation-1", "client-1");
  });

  it("falls back when a WhatsApp escalation holding reply is not configured", async () => {
    setupChannel({ settings: {} });

    await processInboundMessage(inboundWhatsAppMessage());

    expect(mocks.enqueueOutboundMessage).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        body: DEFAULT_ESCALATION_HOLDING_REPLY,
        idempotencyKey: "escalation-holding:escalation-1",
      }),
    );
  });

  it("records holding reply failures and still notifies the owner", async () => {
    setupChannel({
      settings: {
        escalationHoldingReply: "Team Pronto will take over from here.",
      },
    });
    mocks.flushOutboundMessage.mockResolvedValueOnce({
      status: "failed",
      outboundMessageId: "outbound-1",
      error: "WhatsApp send failed",
    });

    await processInboundMessage(inboundWhatsAppMessage());

    expect(mocks.notifyOwnerOfEscalation).toHaveBeenCalledWith("escalation-1", "client-1");
    expect(mocks.query.mock.calls[3][0]).toContain("customer_handoff_status");
    expect(mocks.query.mock.calls[3][1]).toEqual([
      "escalation-1",
      "failed",
      "WhatsApp send failed",
      "client-1",
    ]);
  });

  it("does not throw when an answered customer send fails after processing", async () => {
    setupChannel();
    mocks.runAgentForMessage.mockResolvedValueOnce({
      action: "answered",
      responseText: "We open this Sunday.",
      reasonCode: "grounded_answer",
      reasonDetail: "Answered from source.",
      confidence: 0.9,
      citedChunks: [],
      agentMessageId: "agent-message-1",
      csatUrl: "https://pronto.test/csat/conversation-1?messageId=agent-message-1",
    });
    mocks.flushOutboundMessage.mockResolvedValueOnce({
      status: "failed",
      outboundMessageId: "outbound-1",
      error: "WhatsApp send failed",
    });

    const result = await processInboundMessage(inboundWhatsAppMessage());

    expect(result).toMatchObject({
      duplicate: false,
      action: "answered",
      outboundError: "WhatsApp send failed",
    });
    expect(mocks.enqueueOutboundMessage).toHaveBeenCalledWith(
      { query: mocks.query },
      expect.objectContaining({
        clientId: "client-1",
        conversationId: "conversation-1",
        channelId: "whatsapp-channel-1",
        externalThreadId: "6590000000",
        body: "We open this Sunday.\n\nRate this reply: https://pronto.test/csat/conversation-1?messageId=agent-message-1",
        idempotencyKey: "agent-answer:agent-message-1",
        metadata: expect.objectContaining({
          purpose: "agent_answer",
          customerMessageId: "customer-message-1",
          agentMessageId: "agent-message-1",
          reasonCode: "grounded_answer",
        }),
      }),
    );
    expect(mocks.notifyOwnerOfEscalation).not.toHaveBeenCalled();
  });

  it("reports skipped answered sends without losing processed message state", async () => {
    setupChannel();
    mocks.runAgentForMessage.mockResolvedValueOnce({
      action: "answered",
      responseText: "We open this Sunday.",
      reasonCode: "grounded_answer",
      reasonDetail: "Answered from source.",
      confidence: 0.9,
      citedChunks: [],
      agentMessageId: "agent-message-1",
    });
    mocks.flushOutboundMessage.mockResolvedValueOnce({
      status: "skipped",
      outboundMessageId: "outbound-1",
      reason: "Outbound message is not retryable.",
    });

    const result = await processInboundMessage(inboundWhatsAppMessage());

    expect(result).toMatchObject({
      duplicate: false,
      conversationId: "conversation-1",
      messageId: "customer-message-1",
      action: "answered",
      outboundError: "Outbound message is not retryable.",
    });
    expect(mocks.notifyOwnerOfEscalation).not.toHaveBeenCalled();
  });

  it("does not run the agent when a concurrent duplicate insert is detected", async () => {
    const channel = setupChannel();
    mocks.transaction.mockImplementationOnce(async (callback) => {
      const client = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [{ id: "conversation-1" }] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({
            rows: [{ id: "existing-message-1", conversation_id: "conversation-1" }],
          }),
      };

      return callback(client);
    });

    const result = await processInboundMessage(inboundWhatsAppMessage());

    expect(channel.id).toBe("whatsapp-channel-1");
    expect(result).toMatchObject({
      duplicate: true,
      conversationId: "conversation-1",
      messageId: "existing-message-1",
    });
    expect(mocks.runAgentForMessage).not.toHaveBeenCalled();
    expect(mocks.createEscalation).not.toHaveBeenCalled();
    expect(mocks.enqueueOutboundMessage).not.toHaveBeenCalled();
    expect(mocks.flushOutboundMessage).not.toHaveBeenCalled();
  });
});

function setupChannel(overrides: Partial<Channel> = {}): Channel {
  const channel: Channel = {
    id: "whatsapp-channel-1",
    client_id: "client-1",
    kind: "whatsapp",
    name: "WhatsApp",
    status: "active",
    external_id: "phone-number-id",
    credentials: {},
    settings: {},
    last_health_check_at: null,
    last_health_status: null,
    last_health_error: null,
    last_outbound_at: null,
    last_outbound_error: null,
    ...overrides,
  };

  mocks.query
    .mockResolvedValueOnce({ rows: [channel] })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 })
    .mockResolvedValueOnce({ rows: [{ id: "outbound-1" }] });

  return channel;
}

function inboundWhatsAppMessage() {
  return {
    channelId: "whatsapp-channel-1",
    channelKind: "whatsapp" as const,
    externalMessageId: "wamid.1",
    externalThreadId: "6590000000",
    customerHandle: "6590000000",
    customerName: "Alicia",
    text: "Can you cancel my booking?",
    raw: { message: "raw" },
  };
}
