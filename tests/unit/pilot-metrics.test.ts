import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  query: mocks.query,
}));

import {
  getPilotReadinessSummary,
  updateClientLaunchAndCommercial,
} from "@/lib/pilot-metrics";

describe("pilot metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("summarizes quality, launch, CSAT, and margin metrics", async () => {
    const signedAt = new Date("2026-06-01T00:00:00.000Z");
    const liveAt = new Date("2026-06-04T00:00:00.000Z");
    mocks.query
      .mockResolvedValueOnce({
        rows: [
          {
            reviewed: "5",
            hallucinations: "0",
            blockers: "1",
            accuracy_total: "4",
            accuracy_passed: "3",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ average: "4.5", count: "2" }] })
      .mockResolvedValueOnce({ rows: [{ seconds: "7200" }] })
      .mockResolvedValueOnce({ rows: [{ seconds: "45" }] })
      .mockResolvedValueOnce({ rows: [{ cost_usd: "1.25" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            client_id: "client-1",
            signed_contract_at: signedAt,
            target_live_at: liveAt,
            production_live_at: liveAt,
            notes: "Local launch",
            created_at: signedAt,
            updated_at: liveAt,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            client_id: "client-1",
            monthly_retainer_sgd: "1200",
            setup_fee_sgd: "2400",
            amortized_setup_months: 6,
            hosting_cost_sgd: "80",
            integration_cost_sgd: "150",
            included_conversations: 500,
            llm_cost_buffer_multiplier: "2",
            created_at: signedAt,
            updated_at: liveAt,
          },
        ],
      });

    const summary = await getPilotReadinessSummary("client-1");

    expect(summary.escalationAccuracy).toBe(0.75);
    expect(summary.csatAverage).toBe(4.5);
    expect(summary.timeToFirstPilotConversationSeconds).toBe(7200);
    expect(summary.avgFirstResponseSeconds).toBe(45);
    expect(summary.timeToLiveAgentSeconds).toBe(259200);
    expect(summary.monthlyLlmCostSgd).toBeCloseTo(1.6875);
    expect(summary.estimatedGrossMarginSgd).toBeCloseTo(1366.625);

    const reviewSql = String(mocks.query.mock.calls[0][0]);
    expect(reviewSql).toContain("escalation_was_needed = escalation_outcome.was_escalated");
    expect(reviewSql).toContain("left join lateral");
  });

  it("updates launch and commercial assumptions with audit metadata", async () => {
    mocks.query.mockResolvedValue({ rows: [] });

    await updateClientLaunchAndCommercial({
      clientId: "client-1",
      signedContractAt: "2026-06-01T09:00",
      targetLiveAt: "2026-06-07T09:00",
      productionLiveAt: null,
      launchNotes: "Awaiting WhatsApp keys",
      monthlyRetainerSgd: 1200,
      setupFeeSgd: 2500,
      amortizedSetupMonths: 6,
      hostingCostSgd: 80,
      integrationCostSgd: 150,
      includedConversations: 500,
      llmCostBufferMultiplier: 2,
      actorUserId: "operator-1",
    });

    expect(mocks.query).toHaveBeenCalledTimes(3);
    expect(mocks.query.mock.calls[0][1]).toEqual([
      "client-1",
      "2026-06-01T09:00",
      "2026-06-07T09:00",
      null,
      "Awaiting WhatsApp keys",
    ]);
    expect(mocks.query.mock.calls[1][1]).toEqual([
      "client-1",
      1200,
      2500,
      6,
      80,
      150,
      500,
      2,
    ]);
    expect(mocks.query.mock.calls[2][1]).toEqual([
      "client-1",
      "operator-1",
      {
        monthlyRetainerSgd: 1200,
        targetLiveAt: "2026-06-07T09:00",
      },
    ]);
  });
});
