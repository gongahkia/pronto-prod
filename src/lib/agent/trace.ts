import { createHash } from "node:crypto";
import { query } from "@/lib/db";
import { logWarn } from "@/lib/logger";
import type { KnowledgeChunk } from "@/lib/types";

export type TraceStep = {
  at: string;
  label: string;
  detail?: Record<string, unknown>;
};

export type TraceFinalize = {
  status: "answered" | "escalated";
  reasonCode: string;
  confidence: number;
  responseProvider?: string;
  responseModel?: string;
  embeddingProvider?: string;
  embeddingModel?: string;
  retrievalTopScore?: number | null;
  retrievalThreshold?: number | null;
  retrievalChunks?: KnowledgeChunk[];
  citedChunkIds?: string[];
  promptText?: string;
  promptHash?: string;
  promptTokenEstimate?: number;
  responseTokenEstimate?: number;
  agentMessageId?: string;
  escalationId?: string;
  errorMessage?: string;
};

export class AgentTraceBuilder {
  private readonly clientId: string;
  private readonly conversationId: string;
  private readonly customerMessageId: string;
  private readonly requestId: string | undefined;
  private readonly startedAt: number;
  private readonly steps: TraceStep[] = [];

  constructor(input: {
    clientId: string;
    conversationId: string;
    customerMessageId: string;
    requestId?: string;
  }) {
    this.clientId = input.clientId;
    this.conversationId = input.conversationId;
    this.customerMessageId = input.customerMessageId;
    this.requestId = input.requestId;
    this.startedAt = Date.now();
  }

  addStep(label: string, detail?: Record<string, unknown>): void {
    this.steps.push({
      at: new Date().toISOString(),
      label,
      ...(detail ? { detail } : {}),
    });
  }

  async finalize(input: TraceFinalize): Promise<void> {
    const latencyMs = Date.now() - this.startedAt;
    const chunkScores = (input.retrievalChunks ?? []).map((chunk) => ({
      id: chunk.id,
      score: chunk.score ?? null,
    }));
    const promptHash = input.promptHash ?? (input.promptText
      ? createHash("sha256").update(input.promptText).digest("hex")
      : null);

    try {
      await query(
        `
          insert into agent_traces (
            client_id,
            conversation_id,
            customer_message_id,
            agent_message_id,
            escalation_id,
            request_id,
            status,
            reason_code,
            confidence,
            response_provider,
            response_model,
            embedding_provider,
            embedding_model,
            retrieval_top_score,
            retrieval_threshold,
            retrieval_chunk_count,
            retrieval_chunk_scores,
            cited_chunk_ids,
            prompt_hash,
            prompt_token_estimate,
            response_token_estimate,
            latency_ms,
            error_message,
            steps
          ) values (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
            $21, $22, $23, $24
          )
        `,
        [
          this.clientId,
          this.conversationId,
          this.customerMessageId,
          input.agentMessageId ?? null,
          input.escalationId ?? null,
          this.requestId ?? null,
          input.status,
          input.reasonCode,
          input.confidence,
          input.responseProvider ?? null,
          input.responseModel ?? null,
          input.embeddingProvider ?? null,
          input.embeddingModel ?? null,
          input.retrievalTopScore ?? null,
          input.retrievalThreshold ?? null,
          chunkScores.length,
          JSON.stringify(chunkScores),
          JSON.stringify(input.citedChunkIds ?? []),
          promptHash,
          input.promptTokenEstimate ?? null,
          input.responseTokenEstimate ?? null,
          latencyMs,
          input.errorMessage ?? null,
          JSON.stringify(this.steps),
        ],
      );
    } catch (error) {
      logWarn("agent_trace_persist_failed", {
        requestId: this.requestId,
        clientId: this.clientId,
        conversationId: this.conversationId,
        error,
      });
    }
  }
}
