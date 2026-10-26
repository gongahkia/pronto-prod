import type { KnowledgeChunk } from "@/lib/types";

export type GroundedAnswerDecision = {
  action: "answer" | "escalate";
  answer: string | null;
  confidence: number;
  reasonCode: string;
  reasonDetail: string;
  citedChunkIds: string[];
  usage?: LlmTokenUsage;
  providerResponseId?: string;
  actualModel?: string;
};

export type LlmTokenUsage = {
  inputTokens: number;
  outputTokens: number;
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
  maxOutputTokens?: number;
  timeoutMs?: number;
  maxPromptTokens?: number;
  handoffReason?: string;
  handoffAskForDetails?: boolean;
  conversationalTurn?: boolean;
};

export type LlmCallContext = {
  requestId?: string;
  clientId?: string;
  conversationId?: string;
  operation?: "embedding" | "generation" | "provider_test";
  embeddingTask?: "document" | "query";
};

export type LlmProvider = {
  generateGroundedAnswer(input: GenerateAnswerInput): Promise<GroundedAnswerDecision>;
  embed(
    texts: string[],
    model: string,
    context?: LlmCallContext,
  ): Promise<number[][]>;
};
