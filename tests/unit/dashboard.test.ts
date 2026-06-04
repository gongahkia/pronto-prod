import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  query: mocks.query,
}));

import { getMetrics } from "@/lib/dashboard";

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
});
