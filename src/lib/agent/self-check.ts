import type { GroundedAnswerDecision } from "@/lib/llm/types";
import type { KnowledgeChunk } from "@/lib/types";

export type PostGenerationSelfCheckResult = {
  passed: boolean;
  reasonCode: string;
  reasonDetail: string;
  confidence: number;
};

const forbiddenMutationPatterns = [
  /\b(i('|’)ve|i have|we('|’)ve|we have) (booked|reserved|cancelled|canceled|changed|modified|refunded|processed)\b/i,
  /\b(refund|payment|booking|reservation|order) (has been|is now) (processed|confirmed|cancelled|canceled|changed|modified)\b/i,
  /\bguarantee(d)?\b/i,
];

const stopwords = new Set([
  "about",
  "after",
  "again",
  "also",
  "and",
  "are",
  "for",
  "from",
  "have",
  "that",
  "the",
  "this",
  "with",
  "you",
  "your",
]);

export function evaluatePostGenerationSelfCheck(input: {
  decision: GroundedAnswerDecision;
  retrievedChunks: KnowledgeChunk[];
}): PostGenerationSelfCheckResult {
  if (input.decision.action === "escalate") {
    return {
      passed: true,
      reasonCode: "model_escalated",
      reasonDetail: "The model chose escalation, so no customer answer needs grounding.",
      confidence: input.decision.confidence,
    };
  }

  if (!input.decision.answer?.trim()) {
    return failed("post_check_missing_answer", "The model chose answer without customer-facing text.");
  }

  if (!input.decision.citedChunkIds.length) {
    return failed("post_check_missing_citations", "The model answer did not include source chunk citations.");
  }

  const citedChunks = input.retrievedChunks.filter((chunk) =>
    input.decision.citedChunkIds.includes(chunk.id),
  );
  if (citedChunks.length !== input.decision.citedChunkIds.length) {
    return failed("post_check_invalid_citations", "The model cited chunks that were not retrieved for this turn.");
  }

  if (forbiddenMutationPatterns.some((pattern) => pattern.test(input.decision.answer ?? ""))) {
    return failed(
      "post_check_forbidden_mutation",
      "The answer appears to promise a booking, refund, payment, order change, or other system mutation.",
    );
  }

  const overlap = sourceOverlapScore(input.decision.answer, citedChunks);
  if (overlap < 0.08) {
    return failed(
      "post_check_low_source_overlap",
      `The answer has low lexical overlap with cited sources (${overlap.toFixed(3)}).`,
    );
  }

  return {
    passed: true,
    reasonCode: "post_check_passed",
    reasonDetail: "The answer cited retrieved source chunks and passed local policy checks.",
    confidence: input.decision.confidence,
  };
}

function failed(reasonCode: string, reasonDetail: string): PostGenerationSelfCheckResult {
  return {
    passed: false,
    reasonCode,
    reasonDetail,
    confidence: 1,
  };
}

function sourceOverlapScore(answer: string, chunks: KnowledgeChunk[]): number {
  const answerTokens = meaningfulTokens(answer);
  if (!answerTokens.length) {
    return 0;
  }
  const sourceTokens = new Set(
    chunks.flatMap((chunk) => meaningfulTokens(chunk.content)),
  );
  const matched = answerTokens.filter((token) => sourceTokens.has(token));
  return matched.length / answerTokens.length;
}

function meaningfulTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !stopwords.has(token));
}
