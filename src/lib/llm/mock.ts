import type { GenerateAnswerInput, GroundedAnswerDecision } from "@/lib/llm/types";

const DIMENSIONS = 1536;

export function deterministicEmbedding(text: string): number[] {
  const vector = new Array<number>(DIMENSIONS).fill(0);
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  const tokens = normalized.split(/\s+/).filter(Boolean);

  for (const token of tokens) {
    let hash = 2166136261;
    for (let index = 0; index < token.length; index += 1) {
      hash ^= token.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    vector[Math.abs(hash) % DIMENSIONS] += 1;
  }

  const magnitude =
    Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / magnitude);
}

export async function mockEmbed(texts: string[]): Promise<number[][]> {
  return texts.map(deterministicEmbedding);
}

export function mockGroundedAnswer(
  input: GenerateAnswerInput,
): GroundedAnswerDecision {
  const bestChunk = input.retrievedChunks[0];
  if (!bestChunk || (bestChunk.score ?? 0) < 0.05) {
    return {
      action: "escalate",
      answer: null,
      confidence: 0.1,
      reasonCode: "low_retrieval_confidence",
      reasonDetail: "No sufficiently relevant source was found.",
      citedChunkIds: [],
    };
  }

  const sentence = selectBestSentence(bestChunk.content, input.customerMessage);

  return {
    action: "answer",
    answer: `${sentence.trim()}`,
    confidence: Math.min(0.92, Math.max(0.62, bestChunk.score ?? 0.62)),
    reasonCode: "grounded_answer",
    reasonDetail: "Mock provider selected the top retrieved source.",
    citedChunkIds: [bestChunk.id],
  };
}

function selectBestSentence(content: string, query: string): string {
  const queryTokens = new Set(tokenize(query));
  const sentences = content
    .split(/(?<=[.!?])\s+/)
    .map((candidate) => candidate.trim())
    .filter((candidate) => candidate.length > 20);

  let best = sentences[0] ?? content;
  let bestScore = -1;

  for (const sentence of sentences) {
    const score = tokenize(sentence).filter((token) => queryTokens.has(token)).length;
    if (score > bestScore) {
      best = sentence;
      bestScore = score;
    }
  }

  return best;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}
