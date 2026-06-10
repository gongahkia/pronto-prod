import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  query: mocks.query,
}));

import { getOperationalAlerts } from "@/lib/reporting";

type CostRow = {
  client_id: string;
  client_name: string;
  monthly_retainer_sgd: string;
  setup_fee_sgd: string;
  amortized_setup_months: number;
  hosting_cost_sgd: string;
  integration_cost_sgd: string;
  llm_cost_buffer_multiplier: string;
  monthly_llm_cost_usd: string;
};

function costRow(overrides: Partial<CostRow> = {}): CostRow {
  return {
    client_id: "client-1",
    client_name: "Client One",
    monthly_retainer_sgd: "1200",
    setup_fee_sgd: "2500",
    amortized_setup_months: 6,
    hosting_cost_sgd: "80",
    integration_cost_sgd: "150",
    llm_cost_buffer_multiplier: "2",
    monthly_llm_cost_usd: "50",
    ...overrides,
  };
}

function queueAlertQueries(costRows: CostRow[]): void {
  // failed outbound, channels, refreshes, blockers
  mocks.query.mockResolvedValueOnce({ rows: [] });
  mocks.query.mockResolvedValueOnce({ rows: [] });
  mocks.query.mockResolvedValueOnce({ rows: [] });
  mocks.query.mockResolvedValueOnce({ rows: [] });
  mocks.query.mockResolvedValueOnce({ rows: costRows });
}

describe("operational alerts: cost + concentration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits no cost alert when LLM spend keeps margin above the floor", async () => {
    queueAlertQueries([costRow({ monthly_llm_cost_usd: "20" })]);
    const alerts = await getOperationalAlerts();
    expect(alerts.find((a) => a.id.startsWith("cost:"))).toBeUndefined();
  });

  it("emits a critical cost alert when buffered LLM spend pushes margin negative", async () => {
    queueAlertQueries([
      costRow({
        monthly_llm_cost_usd: "1000", // 1000 * 1.35 * 2 = 2700 SGD LLM cost
      }),
    ]);
    const alerts = await getOperationalAlerts();
    const costAlert = alerts.find((a) => a.id === "cost:client-1");
    expect(costAlert?.severity).toBe("critical");
    expect(costAlert?.detail).toContain("Client One");
  });

  it("flags a client at >= 30% of MRR with a concentration warning", async () => {
    queueAlertQueries([
      costRow({
        client_id: "client-a",
        client_name: "Big Co",
        monthly_retainer_sgd: "5000",
      }),
      costRow({
        client_id: "client-b",
        client_name: "Small Co",
        monthly_retainer_sgd: "1000",
      }),
    ]);
    const alerts = await getOperationalAlerts();
    const concentration = alerts.find((a) => a.id === "concentration:client-a");
    expect(concentration).toBeDefined();
    expect(concentration?.detail).toContain("83%");
    expect(concentration?.severity).toBe("critical");
  });

  it("does not flag concentration when only one client exists", async () => {
    queueAlertQueries([
      costRow({ client_id: "solo", client_name: "Solo", monthly_retainer_sgd: "5000" }),
    ]);
    const alerts = await getOperationalAlerts();
    expect(alerts.find((a) => a.id.startsWith("concentration:"))).toBeUndefined();
  });
});
