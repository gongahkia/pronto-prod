import { describe, expect, it } from "vitest";
import {
  evaluateAiDisclosure,
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

  it("detects direct AI disclosure questions", () => {
    const result = evaluateAiDisclosure(
      "Am I talking to a bot or a human?",
      "North Bridge Nasi",
    );

    expect(result.shouldDisclose).toBe(true);
    expect(result.answer).toContain("AI assistant");
    expect(result.answer).toContain("North Bridge Nasi");
  });

  it("escalates frustration and urgency sentiment", () => {
    const result = evaluatePreGenerationGuardrails(
      "This is urgent and I am very frustrated.",
    );

    expect(result.shouldEscalate).toBe(true);
    expect(result.reasonCode).toBe("urgent_or_negative_sentiment");
  });

  it("escalates low retrieval confidence", () => {
    const result = evaluateRetrievalConfidence(0.4, 0.72);

    expect(result.shouldEscalate).toBe(true);
    expect(result.reasonCode).toBe("low_retrieval_confidence");
  });
});
