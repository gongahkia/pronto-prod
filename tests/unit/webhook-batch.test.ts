import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  processInboundMessage: vi.fn(),
  logWarn: vi.fn(),
}));

vi.mock("@/lib/channels/process", () => ({
  processInboundMessage: mocks.processInboundMessage,
}));

vi.mock("@/lib/logger", () => ({
  logWarn: mocks.logWarn,
}));

import { processWebhookBatch } from "@/lib/channels/webhook-batch";

describe("webhook batch processing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("isolates per-message failures and keeps successful results", async () => {
    mocks.processInboundMessage
      .mockResolvedValueOnce({ duplicate: false, messageId: "message-1" })
      .mockRejectedValueOnce(new Error("agent failed"));

    const result = await processWebhookBatch(
      [
        inboundMessage("wamid.1"),
        inboundMessage("wamid.2"),
      ],
      { requestId: "req_12345678" },
    );

    expect(result).toEqual({
      ok: false,
      requestId: "req_12345678",
      processed: 1,
      failed: 1,
      results: [
        {
          ok: true,
          externalMessageId: "wamid.1",
          result: { duplicate: false, messageId: "message-1" },
        },
        {
          ok: false,
          externalMessageId: "wamid.2",
          error: "Message processing failed.",
        },
      ],
    });
    expect(mocks.logWarn).toHaveBeenCalledWith(
      "webhook_message_processing_failed",
      expect.objectContaining({
        channelId: "channel-1",
        channelKind: "whatsapp",
        externalMessageId: "wamid.2",
        error: expect.any(Error),
      }),
    );
    expect(mocks.processInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({ externalMessageId: "wamid.1" }),
      { requestId: "req_12345678" },
    );
  });
});

function inboundMessage(externalMessageId: string) {
  return {
    channelId: "channel-1",
    channelKind: "whatsapp" as const,
    externalMessageId,
    externalThreadId: "6590000000",
    customerHandle: "6590000000",
    text: "Hello",
    raw: {},
  };
}
