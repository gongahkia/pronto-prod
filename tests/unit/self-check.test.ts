import { describe, expect, it } from "vitest";
import { evaluatePostGenerationSelfCheck } from "@/lib/agent/self-check";
import type { GroundedAnswerDecision } from "@/lib/llm/types";
import type { KnowledgeChunk } from "@/lib/types";

describe("post-generation self-check", () => {
  it("passes a cited answer grounded in retrieved source text", () => {
    const result = evaluatePostGenerationSelfCheck({
      decision: answerDecision({
        answer:
          "Reservations are available for tables of 1 to 6 guests for lunch or dinner.",
        citedChunkIds: ["chunk-1"],
      }),
      retrievedChunks: [
        chunk(
          "chunk-1",
          "Reservations: Tables for 1 to 6 guests can be reserved for lunch or dinner.",
        ),
      ],
    });

    expect(result).toMatchObject({
      passed: true,
      reasonCode: "post_check_passed",
    });
  });

  it("fails answers that cite chunks outside the retrieval set", () => {
    const result = evaluatePostGenerationSelfCheck({
      decision: answerDecision({
        answer: "Saturday and Sunday opening hours are 10:00 AM to 10:00 PM.",
        citedChunkIds: ["missing-chunk"],
      }),
      retrievedChunks: [
        chunk("chunk-1", "Saturday and Sunday: 10:00 AM to 10:00 PM."),
      ],
    });

    expect(result).toMatchObject({
      passed: false,
      reasonCode: "post_check_invalid_citations",
    });
  });

  it("fails answers that promise unsupported business mutations", () => {
    const result = evaluatePostGenerationSelfCheck({
      decision: answerDecision({
        answer:
          "We have cancelled your reservation and your booking is now confirmed as cancelled.",
        citedChunkIds: ["chunk-1"],
      }),
      retrievedChunks: [
        chunk("chunk-1", "Reservation changes must be handled by the restaurant team."),
      ],
    });

    expect(result).toMatchObject({
      passed: false,
      reasonCode: "post_check_forbidden_mutation",
    });
  });

  it("passes a cited Mandarin answer with source overlap", () => {
    const result = evaluatePostGenerationSelfCheck({
      decision: answerDecision({
        answer: "周六和周日营业时间是上午10点到晚上10点。",
        citedChunkIds: ["chunk-1"],
      }),
      retrievedChunks: [
        chunk("chunk-1", "Mandarin opening-hours phrasing: 周六和周日营业时间是上午10点到晚上10点."),
      ],
    });

    expect(result.passed).toBe(true);
  });
});

function answerDecision(
  overrides: Partial<GroundedAnswerDecision>,
): GroundedAnswerDecision {
  return {
    action: "answer",
    answer: null,
    citedChunkIds: [],
    reasonCode: "grounded_answer",
    reasonDetail: "Answered from retrieved knowledge.",
    confidence: 0.92,
    ...overrides,
  };
}

function chunk(id: string, content: string): KnowledgeChunk {
  return {
    id,
    source_id: "source-1",
    client_id: "client-1",
    chunk_index: 0,
    content,
    token_estimate: 20,
    metadata: {},
  };
}
