import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  query: vi.fn(),
  transaction: vi.fn(),
  enqueueOutboundMessage: vi.fn(),
  flushOutboundMessage: vi.fn(),
  recordAuditLog: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireUser: mocks.requireUser,
}));

vi.mock("@/lib/db", () => ({
  query: mocks.query,
  transaction: mocks.transaction,
}));

vi.mock("@/lib/channels/outbox", () => ({
  enqueueOutboundMessage: mocks.enqueueOutboundMessage,
  flushOutboundMessage: mocks.flushOutboundMessage,
}));

vi.mock("@/lib/audit", () => ({
  recordAuditLog: mocks.recordAuditLog,
}));

import { POST } from "@/app/api/escalations/route";

describe("escalation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({
      userId: "operator-1",
      role: "operator",
      clientId: null,
    });
    mocks.query.mockResolvedValueOnce({
      rows: [
        {
          id: "escalation-1",
          client_id: "client-1",
          conversation_id: "conversation-1",
          status: "claimed",
          channel_id: "channel-1",
          channel_kind: "whatsapp",
          external_thread_id: "6590000000",
        },
      ],
    });
    mocks.transaction.mockImplementation(async (callback) => {
      const client = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "escalation-1" }] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] }),
      };
      return callback(client);
    });
    mocks.enqueueOutboundMessage.mockResolvedValue({ id: "outbound-1" });
    mocks.flushOutboundMessage.mockResolvedValue({
      status: "sent",
      outboundMessageId: "outbound-1",
    });
  });

  it("enqueues and flushes owner replies after resolving an escalation", async () => {
    const form = new FormData();
    form.set("action", "resolve");
    form.set("escalationId", "escalation-1");
    form.set("reply", "We can help with this now.");
    form.set("returnTo", "/operator/escalations");

    const response = await POST(
      new Request("http://localhost/api/escalations", {
        method: "POST",
        body: form,
      }),
    );

    expect(mocks.enqueueOutboundMessage).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        clientId: "client-1",
        conversationId: "conversation-1",
        escalationId: "escalation-1",
        channelId: "channel-1",
        externalThreadId: "6590000000",
        body: "We can help with this now.",
        idempotencyKey: "escalation-resolution:escalation-1",
      }),
    );
    expect(mocks.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "escalation.resolved",
        metadata: expect.objectContaining({ outboundQueued: true }),
      }),
      expect.any(Object),
    );
    expect(mocks.flushOutboundMessage).toHaveBeenCalledWith("outbound-1");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/operator/escalations");
  });
});
