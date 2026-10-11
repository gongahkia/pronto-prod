import { describe, expect, it, vi } from "vitest";

const fakes = vi.hoisted(() => ({
  query: vi.fn(),
  sendChannelText: vi.fn(async () => undefined),
}));
vi.mock("@/lib/db", () => ({ query: fakes.query }));
vi.mock("@/lib/channels/dispatch", () => ({ sendChannelText: fakes.sendChannelText }));
vi.mock("@/lib/error-tracking", () => ({ recordErrorEvent: vi.fn(async () => null) }));

import { flushOutboundMessage } from "@/lib/channels/outbox";

describe("known outbound defect: future acceptance specification", () => {
  it("F: does not send twice after provider acceptance and local status-write failure", async () => {
    fakes.sendChannelText.mockClear();
    let claims = 0;
    fakes.query.mockImplementation(async (sql: string) => {
      if (sql.includes("update outbound_messages") && sql.includes("status = 'sending'")) {
        claims += 1;
        return { rows: [{
          id: "outbound-1", client_id: "tenant-1", channel_id: "channel-1",
          conversation_id: "conversation-1", escalation_id: null,
          external_thread_id: "customer-1", body: "Reply", attempt_count: claims,
          status: "sending", metadata: {},
        }] };
      }
      if (sql.includes("status = 'sent'") && claims === 1) {
        throw new Error("injected local status-write failure");
      }
      return { rows: [] };
    });

    await flushOutboundMessage("outbound-1");
    await flushOutboundMessage("outbound-1");
    // Future contract: reconciliation or provider idempotency prevents a duplicate customer send.
    expect(fakes.sendChannelText).toHaveBeenCalledTimes(1);
  });
});
