import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ESCALATION_HOLDING_REPLY } from "@/lib/channels/escalation-handoff";
import type { Channel } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  transaction: vi.fn(),
  runAgentForMessage: vi.fn(),
  createEscalation: vi.fn(),
  sendChannelText: vi.fn(),
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

vi.mock("@/lib/channels/dispatch", () => ({
  sendChannelText: mocks.sendChannelText,
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
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [{ id: "conversation-1" }] })
          .mockResolvedValueOnce({ rows: [{ id: "customer-message-1" }] }),
      };

      return callback(client);
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
    expect(mocks.sendChannelText).toHaveBeenCalledWith({
      channelId: "whatsapp-channel-1",
      externalThreadId: "6590000000",
      text: "Team Pronto will take over from here.",
    });
    expectHoldingReplyInsert("Team Pronto will take over from here.");
    expect(mocks.notifyOwnerOfEscalation).toHaveBeenCalledWith("escalation-1");
  });

  it("falls back when a WhatsApp escalation holding reply is not configured", async () => {
    setupChannel({ settings: {} });

    await processInboundMessage(inboundWhatsAppMessage());

    expect(mocks.sendChannelText).toHaveBeenCalledWith({
      channelId: "whatsapp-channel-1",
      externalThreadId: "6590000000",
      text: DEFAULT_ESCALATION_HOLDING_REPLY,
    });
    expectHoldingReplyInsert(DEFAULT_ESCALATION_HOLDING_REPLY);
  });

  it("records holding reply failures and still notifies the owner", async () => {
    setupChannel({
      settings: {
        escalationHoldingReply: "Team Pronto will take over from here.",
      },
    });
    mocks.sendChannelText.mockRejectedValueOnce(new Error("WhatsApp send failed"));

    await processInboundMessage(inboundWhatsAppMessage());

    expect(mocks.notifyOwnerOfEscalation).toHaveBeenCalledWith("escalation-1");
    expect(mocks.query.mock.calls[2][0]).toContain("customer_handoff_status");
    expect(mocks.query.mock.calls[2][1]).toEqual([
      "escalation-1",
      "failed",
      "WhatsApp send failed",
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
    });
    mocks.sendChannelText.mockRejectedValueOnce(new Error("WhatsApp send failed"));

    const result = await processInboundMessage(inboundWhatsAppMessage());

    expect(result).toMatchObject({
      duplicate: false,
      action: "answered",
      outboundError: "WhatsApp send failed",
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
    expect(mocks.sendChannelText).not.toHaveBeenCalled();
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
    .mockResolvedValueOnce({ rows: [] });

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

function expectHoldingReplyInsert(expectedText: string) {
  const insertCall = mocks.query.mock.calls[2];
  expect(insertCall[0]).toContain("insert into messages");
  expect(insertCall[1]).toEqual([
    "conversation-1",
    "client-1",
    "whatsapp-channel-1",
    expect.stringMatching(/^agent-handoff-/),
    expectedText,
    expect.objectContaining({
      escalationId: "escalation-1",
      reasonCode: "transactional_action",
      policy: "escalation_holding_reply",
      sentToCustomer: true,
    }),
  ]);
}
