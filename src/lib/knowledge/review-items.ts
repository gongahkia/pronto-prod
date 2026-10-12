import { recordAuditLog } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth";
import { query, transaction, type Queryable } from "@/lib/db";
import { createKnowledgeSuggestion } from "@/lib/knowledge/suggestions";

const knowledgeReasons = new Set(["low_retrieval_confidence", "model_escalated", "post_check_missing_citations",
  "post_check_invalid_citations", "post_check_low_source_overlap", "knowledge_conflict"]);

export type KnowledgeReviewItem = {
  id: string; client_id: string; conversation_id: string; message_id: string; escalation_id: string | null;
  reason_code: string; question: string; source_references: Array<{ sourceId: string; title: string;
    sourceUrl: string | null; conflictingClaims: unknown }>;
  status: string; suggestion_id: string | null; created_at: Date;
};

export function describeConflictClaims(claims: unknown): string[] {
  if (!Array.isArray(claims)) return [];
  return claims.flatMap((claim) => {
    if (!claim || typeof claim !== "object") return [];
    const value = claim as Record<string, unknown>;
    const statement = typeof value.cutoff === "string" ? value.cutoff
      : typeof value.claim === "string" ? value.claim : null;
    if (!statement) return [];
    return [`${statement}${typeof value.sourceUrl === "string" ? ` (${value.sourceUrl})` : ""}`];
  });
}

export async function enqueueKnowledgeReviewItem(db: Queryable, input: {
  clientId: string; conversationId: string; messageId: string; escalationId: string; reasonCode: string;
}): Promise<void> {
  if (!knowledgeReasons.has(input.reasonCode)) return;
  const message = await db.query<{ body: string }>(
    "select body from messages where id = $1 and client_id = $2 and conversation_id = $3",
    [input.messageId, input.clientId, input.conversationId]);
  if (!message.rows[0]) return;
  const flagged = await db.query<{ id: string; title: string; metadata: Record<string, unknown> }>(
    `select id,title,metadata from knowledge_sources where client_id = $1
      and metadata->>'reviewStatus' ilike '%conflict%'
      and metadata->>'archived' is distinct from 'true' limit 5`, [input.clientId]);
  const references = input.reasonCode === "knowledge_conflict" ? flagged.rows.map((row) => ({
    sourceId: row.id, title: row.title, sourceUrl: typeof row.metadata.sourceUrl === "string" ? row.metadata.sourceUrl : null,
    conflictingClaims: row.metadata.conflictingClaims ?? null,
  })) : [];
  await db.query(`insert into knowledge_review_items
    (client_id,conversation_id,message_id,escalation_id,reason_code,question,source_references)
    values ($1,$2,$3,$4,$5,$6,$7::jsonb) on conflict (client_id,message_id) do nothing`,
    [input.clientId, input.conversationId, input.messageId, input.escalationId, input.reasonCode,
      message.rows[0].body.slice(0, 4000), JSON.stringify(references)]);
}

export async function listKnowledgeReviewItems(clientId: string): Promise<KnowledgeReviewItem[]> {
  const result = await query<KnowledgeReviewItem>(
    `select * from knowledge_review_items where client_id = $1 order by
      case when status = 'open' then 0 else 1 end, created_at desc limit 100`, [clientId]);
  return result.rows;
}

export async function suggestAnswerForReviewItem(input: { actor: SessionUser; clientId: string;
  reviewItemId: string; title: string; content: string; reason: string; sourceReference?: string;
}): Promise<string> {
  if (input.actor.role !== "client" || input.actor.clientId !== input.clientId)
    throw new Error("Business staff access required.");
  return transaction(async (db) => {
    const item = await db.query<KnowledgeReviewItem>(
      "select * from knowledge_review_items where id = $1 and client_id = $2 for update",
      [input.reviewItemId, input.clientId]);
    if (!item.rows[0] || item.rows[0].status !== "open") throw new Error("Knowledge review item is not open for this business.");
    const suggestionId = await createKnowledgeSuggestion({ actor: input.actor, clientId: input.clientId,
      title: input.title, content: input.content, reason: input.reason,
      sourceReference: input.sourceReference ?? null, requestKey: `review:${input.reviewItemId}`, db });
    await db.query("update knowledge_review_items set status = 'suggested', suggestion_id = $3, updated_at = now() where id = $1 and client_id = $2",
      [input.reviewItemId, input.clientId, suggestionId]);
    await recordAuditLog({ clientId: input.clientId, actorUserId: input.actor.userId,
      action: "knowledge_review.suggested", targetType: "knowledge_review_item", targetId: input.reviewItemId,
      metadata: { suggestionId } }, db);
    return suggestionId;
  }, { isolationLevel: "serializable", retries: 2 });
}
