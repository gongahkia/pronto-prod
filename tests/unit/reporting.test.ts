import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  query: mocks.query,
}));

import {
  getClientDashboardAnalytics,
  getFilteredConversations,
  getOperationalAlerts,
  getSlaSummary,
} from "@/lib/reporting";

describe("reporting helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds filtered conversation queries with safe parameters", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });

    await getFilteredConversations({
      clientId: "client-1",
      query: " Alicia ",
      channelKind: "whatsapp",
      status: "escalated",
      reasonCode: "low_retrieval_confidence",
      reviewLabel: "needs_knowledge_update",
      from: "2026-06-01",
      to: "2026-06-05",
      limit: 20,
    });

    const [sql, params] = mocks.query.mock.calls[0];
    expect(sql).toContain("c.customer_name ilike");
    expect(sql).toContain("ch.kind = $3::channel_kind");
    expect(sql).toContain("c.status = $4::conversation_status");
    expect(sql).toContain("ae.reason_code = $5");
    expect(sql).toContain("lr.answer_label = $6");
    expect(params).toEqual([
      "client-1",
      "%Alicia%",
      "whatsapp",
      "escalated",
      "low_retrieval_confidence",
      "needs_knowledge_update",
      "2026-06-01",
      "2026-06-05",
      20,
    ]);
  });

  it("summarizes client analytics from existing tables", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ conversations: "10", escalated: "3" }] })
      .mockResolvedValueOnce({ rows: [{ count: "2" }] })
      .mockResolvedValueOnce({ rows: [{ seconds: "120" }] })
      .mockResolvedValueOnce({ rows: [{ average: "4.5", count: "6" }] })
      .mockResolvedValueOnce({ rows: [knowledgeGapRow(), knowledgeGapRow()] });

    const result = await getClientDashboardAnalytics("client-1");

    expect(result).toMatchObject({
      conversationCount: 10,
      escalatedConversationCount: 3,
      escalationRate: 0.3,
      actionableEscalations: 2,
      avgFirstResponseSeconds: 120,
      csatAverage: 4.5,
      csatResponses: 6,
      knowledgeGapCount: 2,
    });
  });

  it("summarizes SLA exposure for open triage", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [
        {
          tracked: "3",
          breached: "1",
          soon: "1",
          target_hours: "24",
          oldest_seconds: "90000",
        },
      ],
    });

    const result = await getSlaSummary("client-1");

    expect(result).toEqual({
      clientId: "client-1",
      trackedOpenItems: 3,
      breachedItems: 1,
      soonItems: 1,
      targetHours: 24,
      oldestOpenSeconds: 90000,
    });
    expect(mocks.query.mock.calls[0][1]).toEqual(["client-1"]);
  });

  it("combines operational alert sources into a bounded queue", async () => {
    mocks.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "outbound-1",
            client_id: "client-1",
            client_name: "North Bridge Nasi",
            conversation_id: "conversation-1",
            last_error: "send failed",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "channel-1",
            client_id: "client-1",
            client_name: "North Bridge Nasi",
            kind: "whatsapp",
            last_health_error: "missing token",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await getOperationalAlerts({ clientId: "client-1", limit: 5 });

    expect(result).toEqual([
      {
        id: "outbound:outbound-1",
        severity: "critical",
        title: "Outbound send failed",
        detail: "North Bridge Nasi: send failed",
        href: "/operator/clients/client-1/conversations/conversation-1",
      },
      {
        id: "channel:channel-1",
        severity: "warning",
        title: "Channel health failed",
        detail: "North Bridge Nasi whatsapp: missing token",
        href: "/operator/clients/client-1/channels",
      },
    ]);
  });
});

function knowledgeGapRow() {
  return {
    conversation_id: "conversation-1",
    client_id: "client-1",
    client_name: "North Bridge Nasi",
    customer_name: "Alicia",
    customer_handle: null,
    channel_kind: "console",
    last_message_at: new Date(),
    gap_source: "escalation",
    reason_code: "low_retrieval_confidence",
    review_label: null,
    last_message: "Do you have a karaoke room?",
  };
}
