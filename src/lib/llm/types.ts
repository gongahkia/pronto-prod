import type { KnowledgeChunk } from "@/lib/types";

export type GroundedAnswerDecision = {
  action: "answer" | "escalate";
  answer: string | null;
  confidence: number;
  reasonCode: string;
  reasonDetail: string;
  citedChunkIds: string[];
};

export type GenerateAnswerInput = {
  requestId?: string;
  clientId?: string;
  conversationId?: string;
  clientName: string;
  brandVoice: string;
  brandVoiceDocument?: string | null;
  fewShotExamples?: Array<{
    customerMessage: string;
    idealResponse: string;
    notes?: string | null;
  }>;
  promptPreamble: string;
  customerMessage: string;
  recentMessages: { senderRole: string; body: string }[];
  retrievedChunks: KnowledgeChunk[];
  responseModel: string;
};

export type LlmCallContext = {
  requestId?: string;
  clientId?: string;
  conversationId?: string;
  operation?: "embedding" | "generation" | "provider_test";
};

export type LlmProvider = {
  generateGroundedAnswer(input: GenerateAnswerInput): Promise<GroundedAnswerDecision>;
  embed(
    texts: string[],
    model: string,
    context?: LlmCallContext,
  ): Promise<number[][]>;
};
