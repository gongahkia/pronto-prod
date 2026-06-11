import { describe, expect, it } from "vitest";
import {
  defaultMonthlyWindow,
  formatMonthlyCheckInReport,
} from "@/lib/monthly-report";

describe("monthly check-in report", () => {
  it("computes a 30-day window ending at as-of", () => {
    const asOf = new Date("2026-06-30T12:00:00Z");
    const { windowStart, windowEnd } = defaultMonthlyWindow(asOf);
    const diffDays = (windowEnd.getTime() - windowStart.getTime()) / 86400000;
    expect(diffDays).toBeGreaterThan(29);
    expect(diffDays).toBeLessThan(32);
    expect(windowEnd.toISOString().startsWith("2026-06-30")).toBe(true);
  });

  it("renders metrics and recommendations as plain text", () => {
    const text = formatMonthlyCheckInReport({
      clientId: "c1",
      clientName: "Acme",
      windowStart: new Date("2026-05-12T00:00:00Z"),
      windowEnd: new Date("2026-06-11T23:59:59Z"),
      metrics: {
        conversations: 100,
        escalations: 12,
        escalationRate: 0.12,
        csatAverage: 4.5,
        csatResponses: 20,
        avgFirstResponseSeconds: 8,
        knowledgeGapCount: 4,
      },
      topEscalationReasons: [{ reason_code: "refund_request", count: 6 }],
      recommendations: [
        { type: "knowledge_update", detail: "Add refund policy FAQ." },
      ],
    });
    expect(text).toContain("Acme");
    expect(text).toContain("Conversations: 100");
    expect(text).toContain("CSAT: 4.50");
    expect(text).toContain("refund_request: 6");
    expect(text).toContain("Add refund policy FAQ.");
  });
});
