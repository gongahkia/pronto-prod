import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  query: mocks.query,
}));

import { runRiskMonitor } from "@/lib/risk-monitor";

type Source = {
  id: string;
  kind: "pricing" | "policy";
  label: string;
  url: string;
  cadence_days: number;
  is_active: boolean;
};

describe("risk monitor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.PRONTO_RISK_ALERT_WEBHOOK_URL;
  });

  it("records a changed finding when the content hash differs from the previous snapshot", async () => {
    queueSources([sourceRow({ id: "openai_pricing" })]);
    queueLatestSnapshot("openai_pricing", {
      id: "prev-snap",
      content_hash: "old-hash",
      fetched_at: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });
    queueInsertSnapshot({ id: "new-snap" });
    queueInsertFinding({ id: "finding-1", finding_kind: "changed" });

    const fetcher = vi.fn().mockResolvedValue({ status: 200, body: "fresh body" });
    const result = await runRiskMonitor("pricing", { fetcher });

    expect(fetcher).toHaveBeenCalledWith("https://example.com/pricing");
    expect(result.changed).toBe(1);
    expect(result.findings[0]?.findingKind).toBe("changed");
  });

  it("does not record a finding when the hash matches the previous snapshot", async () => {
    const body = "stable body";
    const matchingHash = await sha256(body);

    queueSources([sourceRow({ id: "openai_pricing" })]);
    queueLatestSnapshot("openai_pricing", {
      id: "prev-snap",
      content_hash: matchingHash,
      fetched_at: new Date(),
    });
    queueInsertSnapshot({ id: "new-snap" });

    const fetcher = vi.fn().mockResolvedValue({ status: 200, body });
    const result = await runRiskMonitor("pricing", { fetcher });

    expect(result.changed).toBe(0);
    expect(result.findings).toHaveLength(0);
  });

  it("records unreachable findings on non-2xx responses", async () => {
    queueSources([sourceRow({ id: "openai_pricing" })]);
    queueLatestSnapshot("openai_pricing", null);
    queueInsertSnapshot({ id: "new-snap" });
    queueInsertFinding({ id: "finding-1", finding_kind: "unreachable" });

    const fetcher = vi.fn().mockResolvedValue({ status: 503, body: "" });
    const result = await runRiskMonitor("pricing", { fetcher });

    expect(result.unreachable).toBe(1);
    expect(result.findings[0]?.findingKind).toBe("unreachable");
  });
});

function sourceRow(overrides: Partial<Source> = {}): Source {
  return {
    id: "openai_pricing",
    kind: "pricing",
    label: "OpenAI pricing",
    url: "https://example.com/pricing",
    cadence_days: 30,
    is_active: true,
    ...overrides,
  };
}

function queueSources(rows: Source[]): void {
  mocks.query.mockResolvedValueOnce({ rows });
}

function queueLatestSnapshot(
  _sourceId: string,
  snapshot:
    | { id: string; content_hash: string | null; fetched_at: Date }
    | null,
): void {
  mocks.query.mockResolvedValueOnce({
    rows: snapshot
      ? [
          {
            id: snapshot.id,
            source_id: "openai_pricing",
            fetched_at: snapshot.fetched_at,
            status_code: 200,
            content_hash: snapshot.content_hash,
            content_length: 100,
            excerpt: null,
            fetch_error: null,
          },
        ]
      : [],
  });
}

function queueInsertSnapshot(overrides: { id: string }): void {
  mocks.query.mockResolvedValueOnce({
    rows: [
      {
        id: overrides.id,
        source_id: "openai_pricing",
        fetched_at: new Date(),
        status_code: 200,
        content_hash: "new-hash",
        content_length: 11,
        excerpt: "fresh body",
        fetch_error: null,
      },
    ],
  });
}

function queueInsertFinding(overrides: {
  id: string;
  finding_kind: "changed" | "unreachable" | "overdue";
}): void {
  mocks.query.mockResolvedValueOnce({
    rows: [
      {
        id: overrides.id,
        source_id: "openai_pricing",
        finding_kind: overrides.finding_kind,
        detected_at: new Date(),
        previous_snapshot_id: "prev-snap",
        current_snapshot_id: "new-snap",
        summary: "stub",
        acknowledged_at: null,
      },
    ],
  });
}

async function sha256(input: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(input).digest("hex");
}
