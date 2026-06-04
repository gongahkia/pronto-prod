import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  query: mocks.query,
}));

import {
  getConversationActionableEscalation,
  getConversationTriageDetail,
  getMetrics,
} from "@/lib/dashboard";

describe("dashboard metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue({ rows: [{ count: "0" }] });
  });

  it("counts actionable escalations using the latest owner resolution outbound status", async () => {
    await getMetrics("client-1");

    const actionableQuery = String(mocks.query.mock.calls[3][0]);
    expect(actionableQuery).toContain("left join lateral");
    expect(actionableQuery).toContain("metadata->>'purpose' = 'escalation_resolution_reply'");
    expect(actionableQuery).toContain("e.status <> 'resolved'");
    expect(actionableQuery).toContain("owner_reply.status in ('pending', 'sending', 'failed')");
    expect(mocks.query.mock.calls[3][1]).toEqual(["client-1"]);
  });

  it("loads one scoped conversation with its actionable escalation marker", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });

    await getConversationTriageDetail({
      clientId: "client-1",
      conversationId: "conversation-1",
    });

    const sql = String(mocks.query.mock.calls[0][0]);
    expect(sql).toContain("where c.client_id = $1 and c.id = $2");
    expect(sql).toContain("left join lateral");
    expect(sql).toContain("metadata->>'purpose' = 'escalation_resolution_reply'");
    expect(mocks.query.mock.calls[0][1]).toEqual(["client-1", "conversation-1"]);
  });

  it("loads at most one actionable escalation for a conversation detail screen", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });

    await getConversationActionableEscalation({
      clientId: "client-1",
      conversationId: "conversation-1",
    });

    const sql = String(mocks.query.mock.calls[0][0]);
    expect(sql).toContain("where e.client_id = $1");
    expect(sql).toContain("and e.conversation_id = $2");
    expect(sql).toContain("order by e.created_at desc");
    expect(sql).toContain("limit 1");
    expect(mocks.query.mock.calls[0][1]).toEqual(["client-1", "conversation-1"]);
  });
});
