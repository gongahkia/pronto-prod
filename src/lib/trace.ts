import { query } from "@/lib/db";
import type { SenderRole } from "@/lib/types";

export type TraceMessage = {
  id: string;
  sender_role: SenderRole;
  body: string;
  created_at: Date;
  metadata: Record<string, unknown>;
};

export type TraceProviderEvent = {
  id: string;
  provider: string;
  model: string;
  operation: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  metadata: Record<string, unknown>;
  created_at: Date;
  message_id: string | null;
};

export type TraceEscalation = {
  id: string;
  status: string;
  reason_code: string;
  reason_detail: string;
  confidence: number | null;
  created_at: Date;
  resolved_at: Date | null;
};

export type TraceReview = {
  id: string;
  hallucination: boolean;
  escalation_was_needed: boolean | null;
  csat: number | null;
  notes: string | null;
  created_at: Date;
};

export type AgentTraceRow = {
  id: string;
  customer_message_id: string | null;
  agent_message_id: string | null;
  escalation_id: string | null;
  request_id: string | null;
  status: string;
  reason_code: string | null;
  confidence: number | null;
  response_provider: string | null;
  response_model: string | null;
  embedding_provider: string | null;
  embedding_model: string | null;
  retrieval_top_score: number | null;
  retrieval_threshold: number | null;
  retrieval_chunk_count: number;
  retrieval_chunk_scores: Array<{ id: string; score: number | null }>;
  cited_chunk_ids: string[];
  prompt_hash: string | null;
  prompt_token_estimate: number | null;
  response_token_estimate: number | null;
  used_failover: boolean;
  failover_provider: string | null;
  failover_model: string | null;
  failover_reason: string | null;
  latency_ms: number | null;
  error_message: string | null;
  steps: Array<{ at: string; label: string; detail?: Record<string, unknown> }>;
  created_at: Date;
};

export type ConversationTrace = {
  conversationId: string;
  clientId: string;
  channelKind: string;
  messages: TraceMessage[];
  providerEvents: TraceProviderEvent[];
  escalations: TraceEscalation[];
  reviews: TraceReview[];
  agentTraces: AgentTraceRow[];
  totals: {
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
    providerCalls: number;
    agentRuns: number;
    avgLatencyMs: number | null;
  };
};

export async function getConversationTrace(conversationId: string): Promise<ConversationTrace | null> {
  const convResult = await query<{ id: string; client_id: string; channel_kind: string }>(
    `
      select c.id, c.client_id, ch.kind as channel_kind
      from conversations c
      join channels ch on ch.id = c.channel_id
      where c.id = $1
    `,
    [conversationId],
  );
  const convo = convResult.rows[0];
  if (!convo) return null;

  const [messages, providerEvents, escalations, reviews, agentTraces] = await Promise.all([
    query<TraceMessage>(
      `
        select id, sender_role, body, created_at, metadata
        from messages
        where conversation_id = $1
        order by created_at asc
      `,
      [conversationId],
    ),
    query<TraceProviderEvent & { estimated_cost_usd: string; input_tokens: string; output_tokens: string }>(
      `
        select id, provider, model, operation, input_tokens, output_tokens,
               estimated_cost_usd::text as estimated_cost_usd, metadata, created_at, message_id
        from agent_usage_events
        where conversation_id = $1
        order by created_at asc
      `,
      [conversationId],
    ),
    query<TraceEscalation & { confidence: string | null }>(
      `
        select id, status, reason_code, reason_detail, confidence::text as confidence,
               created_at, resolved_at
        from escalations
        where conversation_id = $1
        order by created_at asc
      `,
      [conversationId],
    ),
    query<TraceReview>(
      `
        select id, hallucination, escalation_was_needed, csat, notes, created_at
        from reviews
        where conversation_id = $1
        order by created_at desc
      `,
      [conversationId],
    ),
    safeAgentTraces(conversationId),
  ]);

  const providerEventRows: TraceProviderEvent[] = providerEvents.rows.map((row) => ({
    id: row.id,
    provider: row.provider,
    model: row.model,
    operation: row.operation,
    input_tokens: Number(row.input_tokens),
    output_tokens: Number(row.output_tokens),
    estimated_cost_usd: Number(row.estimated_cost_usd),
    metadata: row.metadata,
    created_at: row.created_at,
    message_id: row.message_id,
  }));

  const totals = providerEventRows.reduce(
    (acc, event) => ({
      inputTokens: acc.inputTokens + event.input_tokens,
      outputTokens: acc.outputTokens + event.output_tokens,
      estimatedCostUsd: acc.estimatedCostUsd + event.estimated_cost_usd,
      providerCalls: acc.providerCalls + 1,
    }),
    { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, providerCalls: 0 },
  );

  const agentLatencies = agentTraces
    .map((row) => row.latency_ms)
    .filter((value): value is number => typeof value === "number");
  const avgLatencyMs = agentLatencies.length
    ? agentLatencies.reduce((sum, value) => sum + value, 0) / agentLatencies.length
    : null;

  return {
    conversationId: convo.id,
    clientId: convo.client_id,
    channelKind: convo.channel_kind,
    messages: messages.rows,
    providerEvents: providerEventRows,
    escalations: escalations.rows.map((row) => ({
      ...row,
      confidence: row.confidence === null ? null : Number(row.confidence),
    })),
    reviews: reviews.rows,
    agentTraces,
    totals: {
      ...totals,
      agentRuns: agentTraces.length,
      avgLatencyMs,
    },
  };
}

async function safeAgentTraces(conversationId: string): Promise<AgentTraceRow[]> {
  try {
    const result = await query<{
      id: string;
      customer_message_id: string | null;
      agent_message_id: string | null;
      escalation_id: string | null;
      request_id: string | null;
      status: string;
      reason_code: string | null;
      confidence: string | null;
      response_provider: string | null;
      response_model: string | null;
      embedding_provider: string | null;
      embedding_model: string | null;
      retrieval_top_score: string | null;
      retrieval_threshold: string | null;
      retrieval_chunk_count: number;
      retrieval_chunk_scores: unknown;
      cited_chunk_ids: unknown;
      prompt_hash: string | null;
      prompt_token_estimate: number | null;
      response_token_estimate: number | null;
      used_failover: boolean;
      failover_provider: string | null;
      failover_model: string | null;
      failover_reason: string | null;
      latency_ms: number | null;
      error_message: string | null;
      steps: unknown;
      created_at: Date;
    }>(
      `
        select id, customer_message_id, agent_message_id, escalation_id, request_id,
               status, reason_code, confidence::text as confidence,
               response_provider, response_model, embedding_provider, embedding_model,
               retrieval_top_score::text as retrieval_top_score,
               retrieval_threshold::text as retrieval_threshold,
               retrieval_chunk_count, retrieval_chunk_scores, cited_chunk_ids,
               prompt_hash, prompt_token_estimate, response_token_estimate,
               used_failover, failover_provider, failover_model, failover_reason,
               latency_ms, error_message, steps, created_at
        from agent_traces
        where conversation_id = $1
        order by created_at asc
      `,
      [conversationId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      customer_message_id: row.customer_message_id,
      agent_message_id: row.agent_message_id,
      escalation_id: row.escalation_id,
      request_id: row.request_id,
      status: row.status,
      reason_code: row.reason_code,
      confidence: row.confidence === null ? null : Number(row.confidence),
      response_provider: row.response_provider,
      response_model: row.response_model,
      embedding_provider: row.embedding_provider,
      embedding_model: row.embedding_model,
      retrieval_top_score:
        row.retrieval_top_score === null ? null : Number(row.retrieval_top_score),
      retrieval_threshold:
        row.retrieval_threshold === null ? null : Number(row.retrieval_threshold),
      retrieval_chunk_count: row.retrieval_chunk_count,
      retrieval_chunk_scores: (row.retrieval_chunk_scores as AgentTraceRow["retrieval_chunk_scores"]) ?? [],
      cited_chunk_ids: (row.cited_chunk_ids as string[]) ?? [],
      prompt_hash: row.prompt_hash,
      prompt_token_estimate: row.prompt_token_estimate,
      response_token_estimate: row.response_token_estimate,
      used_failover: row.used_failover,
      failover_provider: row.failover_provider,
      failover_model: row.failover_model,
      failover_reason: row.failover_reason,
      latency_ms: row.latency_ms,
      error_message: row.error_message,
      steps: (row.steps as AgentTraceRow["steps"]) ?? [],
      created_at: row.created_at,
    }));
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "42P01"
    ) {
      return [];
    }
    throw error;
  }
}
