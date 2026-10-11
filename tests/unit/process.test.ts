import { beforeEach, describe, expect, it, vi } from "vitest";

const fakes = vi.hoisted(() => ({
  ingestInboundMessage: vi.fn(), ingestInboundMessages: vi.fn(),
  processInboundJob: vi.fn(), query: vi.fn(),
}));
vi.mock("@/lib/channels/inbox", () => ({
  ingestInboundMessage: fakes.ingestInboundMessage,
  ingestInboundMessages: fakes.ingestInboundMessages,
}));
vi.mock("@/lib/channels/inbox-worker", () => ({ processInboundJob: fakes.processInboundJob }));
vi.mock("@/lib/db", () => ({ query: fakes.query }));

import { processInboundMessage, processInboundMessages } from "@/lib/channels/process";

const inbound = {
  channelId: "channel-a", channelKind: "whatsapp" as const,
  externalMessageId: "wamid.1", externalThreadId: "customer-a",
  customerHandle: "customer-a", text: "When do you close?", raw: {},
};

describe("durable inbound entry points", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    fakes.ingestInboundMessage.mockResolvedValue({
      duplicate: false, jobId: "job-a", conversationId: "conversation-a", messageId: "message-a",
    });
  });

  it("acknowledges the accepted batch without invoking AI or outbound work", async () => {
    fakes.ingestInboundMessages.mockResolvedValue({ ok: true, accepted: 1, duplicates: 0, jobIds: ["job-a"] });
    const result = await processInboundMessages([inbound], { requestId: "request-a" });
    expect(result).toEqual({ ok: true, accepted: 1, duplicates: 0, jobIds: ["job-a"] });
    expect(fakes.ingestInboundMessages).toHaveBeenCalledWith([inbound]);
    expect(fakes.processInboundJob).not.toHaveBeenCalled();
  });

  it("runs the same durable job path for local synchronous evaluation", async () => {
    fakes.processInboundJob.mockResolvedValue({ jobId: "job-a", outcome: "answered" });
    fakes.query.mockResolvedValue({ rows: [{ body: "We close at 9 pm.", metadata: { reasonCode: "grounded_answer" } }] });
    const result = await processInboundMessage(inbound);
    expect(fakes.processInboundJob).toHaveBeenCalledWith({ jobId: "job-a", requestId: undefined });
    expect(result).toMatchObject({ action: "answered", responseText: "We close at 9 pm.",
      conversationId: "conversation-a", messageId: "message-a" });
  });
});
