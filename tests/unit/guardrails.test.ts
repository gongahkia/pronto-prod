import { describe, expect, it } from "vitest";
import {
  evaluateAiDisclosure,
  evaluatePreGenerationGuardrails,
  evaluateRetrievalConfidence,
  evaluateSmallTalkGreeting,
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

  it("allows process questions about reservations", () => {
    const result = evaluatePreGenerationGuardrails(
      "How do I reserve a table for four tonight?",
    );

    expect(result.shouldEscalate).toBe(false);
  });

  it("escalates customer requests for a call or human handoff", () => {
    const result = evaluatePreGenerationGuardrails(
      "Can we hop on a short call?",
    );

    expect(result.shouldEscalate).toBe(true);
    expect(result.reasonCode).toBe("human_handoff_requested");
  });

  it("allows ordinary F&B questions before retrieval", () => {
    const result = evaluatePreGenerationGuardrails("Are you open this Sunday?");

    expect(result.shouldEscalate).toBe(false);
    expect(result.reasonCode).toBe("in_scope");
  });

  it("escalates clearly unrelated scope requests", () => {
    const result = evaluatePreGenerationGuardrails(
      "Do you have a private karaoke room policy?",
    );

    expect(result.shouldEscalate).toBe(true);
    expect(result.reasonCode).toBe("out_of_scope");
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

  it("answers standalone greetings without retrieval", () => {
    const result = evaluateSmallTalkGreeting("hello?", "North Bridge Nasi");

    expect(result.shouldAnswer).toBe(true);
    expect(result.answer).toContain("North Bridge Nasi");
    expect(result.answer).toContain("hours");
  });

  it("does not treat greeting-prefixed business questions as small talk", () => {
    const result = evaluateSmallTalkGreeting(
      "hello, what time do you open?",
      "North Bridge Nasi",
    );

    expect(result.shouldAnswer).toBe(false);
  });

  it("escalates frustration and urgency sentiment", () => {
    const result = evaluatePreGenerationGuardrails(
      "This is urgent and I am very frustrated.",
    );

    expect(result.shouldEscalate).toBe(true);
    expect(result.reasonCode).toBe("urgent_or_negative_sentiment");
  });

  it("escalates Mandarin refund and handoff requests", () => {
    const refund = evaluatePreGenerationGuardrails("我要退款，订单送迟了");
    const handoff = evaluatePreGenerationGuardrails("我要找人工客服");

    expect(refund.reasonCode).toBe("complaint_or_refund");
    expect(handoff.reasonCode).toBe("human_handoff_requested");
  });

  it("escalates Malay transactional requests", () => {
    const result = evaluatePreGenerationGuardrails("Tolong batalkan tempahan saya");

    expect(result.shouldEscalate).toBe(true);
    expect(result.reasonCode).toBe("transactional_action");
  });

  it("extends guardrails with configured sentiment triggers", () => {
    const result = evaluatePreGenerationGuardrails("I am properly annoyed.", {
      sentimentTriggers: ["annoyed"],
    });

    expect(result.shouldEscalate).toBe(true);
    expect(result.reasonCode).toBe("urgent_or_negative_sentiment");
  });

  it("can disable a default reason code for pilot tuning", () => {
    const result = evaluatePreGenerationGuardrails("Do you have karaoke rooms?", {
      disabledReasonCodes: ["out_of_scope"],
    });

    expect(result.shouldEscalate).toBe(false);
    expect(result.reasonCode).toBe("in_scope");
  });

  it("escalates low retrieval confidence", () => {
    const result = evaluateRetrievalConfidence(0.4, 0.72);

    expect(result.shouldEscalate).toBe(true);
    expect(result.reasonCode).toBe("low_retrieval_confidence");
  });
});
