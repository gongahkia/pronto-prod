import { describe, expect, it } from "vitest";
import {
  evaluatePreGenerationGuardrails,
  evaluateRetrievalConfidence,
} from "@/lib/agent/guardrails";

describe("agent guardrails", () => {
  it("escalates refund and complaint requests", () => {
    const result = evaluatePreGenerationGuardrails(
      "My order was late and I want a refund now",
    );

    expect(result.shouldEscalate).toBe(true);
    expect(result.reasonCode).toBe("complaint_or_refund");
  });

  it("escalates transactional mutations", () => {
    const result = evaluatePreGenerationGuardrails(
      "Can you cancel my booking for tonight?",
    );

    expect(result.shouldEscalate).toBe(true);
    expect(result.reasonCode).toBe("transactional_action");
  });

  it("allows ordinary F&B questions before retrieval", () => {
    const result = evaluatePreGenerationGuardrails("Are you open this Sunday?");

    expect(result.shouldEscalate).toBe(false);
    expect(result.reasonCode).toBe("in_scope");
  });

  it("escalates low retrieval confidence", () => {
    const result = evaluateRetrievalConfidence(0.4, 0.72);

    expect(result.shouldEscalate).toBe(true);
    expect(result.reasonCode).toBe("low_retrieval_confidence");
  });
});

