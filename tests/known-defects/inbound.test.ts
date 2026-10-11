import { beforeEach, describe, expect, it, vi } from "vitest";

const fakes = vi.hoisted(() => ({
  query: vi.fn(),
  transaction: vi.fn(),
  runAgentForMessage: vi.fn(),
  createEscalation: vi.fn(),
  enqueueOutboundMessage: vi.fn(),
  flushOutboundMessage: vi.fn(),
  notifyOwnerOfEscalation: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ query: fakes.query, transaction: fakes.transaction }));
vi.mock("@/lib/agent/engine", () => ({
  runAgentForMessage: fakes.runAgentForMessage,
  createEscalation: fakes.createEscalation,
}));
vi.mock("@/lib/channels/outbox", () => ({
  enqueueOutboundMessage: fakes.enqueueOutboundMessage,
  flushOutboundMessage: fakes.flushOutboundMessage,
}));
vi.mock("@/lib/escalations", () => ({ notifyOwnerOfEscalation: fakes.notifyOwnerOfEscalation }));

import { processInboundMessage } from "@/lib/channels/process";

const channel = {
  id: "channel-a",
  client_id: "tenant-a",
  kind: "whatsapp",
  status: "active",
  credentials: {},
  settings: {},
};
const inbound = {
  channelId: "channel-a",
  channelKind: "whatsapp" as const,
  externalMessageId: "provider-message-1",
  externalThreadId: "customer-1",
  customerHandle: "customer-1",
  text: "Are you open?",
  raw: { fixture: true },
};

describe("known inbound defects: future acceptance specifications", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    fakes.transaction.mockImplementation(async (callback) => callback({
      query: vi.fn(async (sql: string) => {
        if (sql.includes("insert into conversations")) {
          return { rows: [{ id: "conversation-1", status: "active" }] };
        }
        if (sql.includes("insert into messages")) {
          return { rows: [{ id: "message-1" }] };
        }
        return { rows: [] };
      }),
    }));
  });

  it("A: resumes processing after an agent failure and provider redelivery", async () => {
    let persisted = false;
    fakes.query.mockImplementation(async (sql: string) => {
      if (sql.includes("from channels")) return { rows: [channel] };
      if (sql.includes("from messages")) {
        return persisted
          ? { rowCount: 1, rows: [{ id: "message-1" }] }
          : { rowCount: 0, rows: [] };
      }
      return { rows: [] };
    });
    fakes.transaction.mockImplementation(async (callback) => {
      const result = await callback({
        query: vi.fn(async (sql: string) => {
          if (sql.includes("insert into conversations")) return { rows: [{ id: "conversation-1" }] };
          if (sql.includes("insert into messages")) return { rows: [{ id: "message-1" }] };
          return { rows: [] };
        }),
      });
      persisted = true;
      return result;
    });
    fakes.runAgentForMessage
      .mockRejectedValueOnce(new Error("injected failure after persistence"))
      .mockResolvedValueOnce({
        action: "answered", responseText: "Open today.", reasonCode: "grounded_answer",
        agentMessageId: "agent-1",
      });
    fakes.enqueueOutboundMessage.mockResolvedValue({ id: "outbound-1" });
    fakes.flushOutboundMessage.mockResolvedValue({ status: "sent", outboundMessageId: "outbound-1" });

    await expect(processInboundMessage(inbound)).rejects.toThrow("injected failure");
    await processInboundMessage(inbound);
    // Future contract: a persisted but unfinished message is eligible for replay.
    expect(fakes.runAgentForMessage).toHaveBeenCalledTimes(2);
  });

  it("B: leaves an open human-owned conversation to the human", async () => {
    fakes.query
      .mockResolvedValueOnce({ rows: [channel] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });
    fakes.transaction.mockImplementation(async (callback) => callback({
      query: vi.fn(async (sql: string) => {
        if (sql.includes("insert into conversations")) {
          return { rows: [{ id: "conversation-1", status: "escalated" }] };
        }
        if (sql.includes("insert into messages")) return { rows: [{ id: "message-2" }] };
        return { rows: [] };
      }),
    }));
    fakes.runAgentForMessage.mockResolvedValue({
      action: "answered", responseText: "I can help.", reasonCode: "grounded_answer",
      agentMessageId: "agent-2",
    });
    fakes.enqueueOutboundMessage.mockResolvedValue({ id: "outbound-2" });
    fakes.flushOutboundMessage.mockResolvedValue({ status: "sent", outboundMessageId: "outbound-2" });

    await processInboundMessage({ ...inbound, externalMessageId: "provider-message-2" });
    expect(fakes.runAgentForMessage).not.toHaveBeenCalled();
  });

  it("C: rejects inbound work for a disabled channel", async () => {
    fakes.query
      .mockResolvedValueOnce({ rows: [{ ...channel, status: "disabled" }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });
    fakes.runAgentForMessage.mockResolvedValue({
      action: "answered", responseText: "Open today.", reasonCode: "grounded_answer",
      agentMessageId: "agent-3",
    });
    fakes.enqueueOutboundMessage.mockResolvedValue({ id: "outbound-3" });
    fakes.flushOutboundMessage.mockResolvedValue({ status: "sent", outboundMessageId: "outbound-3" });

    await expect(processInboundMessage(inbound)).rejects.toThrow(/disabled|inactive/i);
    expect(fakes.runAgentForMessage).not.toHaveBeenCalled();
  });
});
