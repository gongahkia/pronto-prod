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

export type ConversationTrace = {
  conversationId: string;
  clientId: string;
  channelKind: string;
  messages: TraceMessage[];
  providerEvents: TraceProviderEvent[];
  escalations: TraceEscalation[];
  reviews: TraceReview[];
  totals: {
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
    providerCalls: number;
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

  const [messages, providerEvents, escalations, reviews] = await Promise.all([
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
    totals,
  };
}
