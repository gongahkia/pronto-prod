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
  /已经(预订|取消|更改|退款|处理)|保证/,
  /\b(saya|kami) telah (tempah|batalkan|ubah|bayar balik|proses)\b/i,
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
  "anda",
  "awak",
  "dan",
  "dari",
  "ini",
  "itu",
  "kami",
  "the",
  "untuk",
]);

const cjkStopCharacters = new Set("的是了在和有吗我你他她它们这那");

export function evaluatePostGenerationSelfCheck(input: {
  decision: GroundedAnswerDecision;
  retrievedChunks: KnowledgeChunk[];
  clarificationContext?: string;
  operationalContext?: string;
  requireQuestion?: boolean;
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

  if (!input.decision.citedChunkIds.length && !input.clarificationContext && !input.operationalContext) {
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

  if (input.clarificationContext && input.requireQuestion !== false && !/[?？]/.test(input.decision.answer)) {
    return failed("post_check_missing_question", "The handoff intake did not ask a clarification question.");
  }
  const overlap = sourceOverlapScore(input.decision.answer, citedChunks,
    [input.clarificationContext, input.operationalContext].filter(Boolean).join("\n"));
  if (overlap < 0.08) {
    return failed(
      "post_check_low_source_overlap",
      `The answer has low lexical overlap with cited sources (${overlap.toFixed(3)}).`,
    );
  }

  return {
    passed: true,
    reasonCode: "post_check_passed",
    reasonDetail: input.operationalContext ? "The conversational reply matches the assistant's identity and passed local policy checks."
      : input.clarificationContext ? "The clarification relates to the customer's message and passed local policy checks."
      : "The answer cited retrieved source chunks and passed local policy checks.",
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

function sourceOverlapScore(answer: string, chunks: KnowledgeChunk[], clarificationContext?: string): number {
  const answerTokens = meaningfulTokens(answer);
  if (!answerTokens.length) {
    return 0;
  }
  const sourceTokens = new Set(
    [...chunks.flatMap((chunk) => meaningfulTokens(chunk.content)), ...meaningfulTokens(clarificationContext ?? "")],
  );
  const matched = answerTokens.filter((token) => sourceTokens.has(token));
  return matched.length / answerTokens.length;
}

function meaningfulTokens(text: string): string[] {
  const tokens: string[] = [];
  for (const match of text.toLowerCase().matchAll(/[\p{L}\p{N}]+/gu)) {
    const token = match[0];
    if (/^[\u4e00-\u9fff]+$/u.test(token)) {
      tokens.push(...cjkBigrams(token));
      continue;
    }
    if (token.length > 2 && !stopwords.has(token)) {
      tokens.push(token);
    }
  }
  return tokens;
}

function cjkBigrams(value: string): string[] {
  const chars = Array.from(value).filter((char) => !cjkStopCharacters.has(char));
  if (chars.length <= 1) return chars;
  const tokens: string[] = [];
  for (let index = 0; index < chars.length - 1; index += 1) {
    tokens.push(`${chars[index]}${chars[index + 1]}`);
  }
  return tokens;
}
