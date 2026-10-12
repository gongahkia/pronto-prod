import { randomUUID } from "node:crypto";
import { recordAuditLog } from "@/lib/audit";
import { stageKnowledge } from "@/lib/assistant-drafts";
import type { SessionUser } from "@/lib/auth";
import { query, transaction, type Queryable } from "@/lib/db";
import { requireStaffCapability } from "@/lib/staff-permissions";

export type KnowledgeSuggestion = {
  id: string; client_id: string; source_id: string | null; target_source_id: string;
  status: "pending" | "revision_requested" | "rejected" | "approved" | "staged" | "published";
  current_revision: number; created_by: string | null; reviewed_by: string | null;
  reviewed_at: Date | null; reviewed_revision: number | null; review_note: string | null;
  staged_edit_version: number | null; created_at: Date; updated_at: Date;
  title: string; content: string; reason: string; source_reference: string | null;
  outlet_name: string | null; author_name: string | null; reviewer_name: string | null;
};

export async function listKnowledgeSuggestions(clientId: string): Promise<KnowledgeSuggestion[]> {
  const result = await query<KnowledgeSuggestion>(
    `select s.*, r.title, r.content, r.reason, r.source_reference, r.outlet_name,
      author.name as author_name, reviewer.name as reviewer_name
     from knowledge_suggestions s
     join knowledge_suggestion_revisions r on r.suggestion_id = s.id and r.revision = s.current_revision
       and r.client_id = s.client_id
     left join users author on author.id = s.created_by
     left join users reviewer on reviewer.id = s.reviewed_by
     where s.client_id = $1 order by s.updated_at desc limit 100`, [clientId]);
  return result.rows;
}

export async function createKnowledgeSuggestion(input: {
  actor: SessionUser; clientId: string; sourceId?: string | null; title: string;
  content: string; reason: string; sourceReference?: string | null;
  outletName?: string | null; requestKey?: string; db?: Queryable;
}): Promise<string> {
  assertBusinessActor(input.actor, input.clientId);
  const title = bounded(input.title, 200, "A proposed fact title is required.");
  const content = bounded(input.content, 8000, "A proposed answer or policy is required.");
  const reason = bounded(input.reason, 1000, "Explain why this correction is needed.");
  const reference = optionalBounded(input.sourceReference, 500);
  const outlet = optionalBounded(input.outletName, 200);
  const requestKey = input.requestKey ? bounded(input.requestKey, 120, "Invalid request key.") : null;
  const create = async (db: Queryable) => {
    const matchingOriginal = async () => {
      const existing = await db.query<{ id: string; source_id: string | null; title: string; content: string;
        reason: string; source_reference: string | null; outlet_name: string | null }>(
        `select s.id, s.source_id, r.title, r.content, r.reason, r.source_reference, r.outlet_name
         from knowledge_suggestions s join knowledge_suggestion_revisions r
           on r.suggestion_id = s.id and r.client_id = s.client_id and r.revision = 1
         where s.client_id = $1 and s.created_by = $2 and s.request_key = $3`,
        [input.clientId, input.actor.userId, requestKey]);
      const original = existing.rows[0];
      if (!original) return null;
      if (original.source_id !== (input.sourceId ?? null) || original.title !== title ||
          original.content !== content || original.reason !== reason ||
          original.source_reference !== reference || original.outlet_name !== outlet)
        throw new Error("This request key was already used for a different correction.");
      return original.id;
    };
    if (requestKey) {
      const existingId = await matchingOriginal();
      if (existingId) return existingId;
    }
    if (input.sourceId) {
      const source = await db.query<{ id: string }>(
        "select id from knowledge_sources where id = $1 and client_id = $2",
        [input.sourceId, input.clientId]);
      if (!source.rows[0]) throw new Error("Business knowledge source not found.");
    }
    const id = randomUUID();
    const targetSourceId = input.sourceId ?? id;
    const inserted = await db.query<{ id: string }>(
      `insert into knowledge_suggestions
       (id, client_id, source_id, target_source_id, created_by, request_key)
       values ($1, $2, $3, $4, $5, $6) on conflict do nothing returning id`,
      [id, input.clientId, input.sourceId ?? null, targetSourceId, input.actor.userId, requestKey]);
    if (!inserted.rows[0]) {
      const repeatedId = await matchingOriginal();
      if (repeatedId) return repeatedId;
      throw new Error("Suggestion could not be saved.");
    }
    await db.query(
      `insert into knowledge_suggestion_revisions
       (suggestion_id, client_id, revision, title, content, reason, source_reference, outlet_name, created_by)
       values ($1, $2, 1, $3, $4, $5, $6, $7, $8)`,
      [id, input.clientId, title, content, reason, reference, outlet, input.actor.userId]);
    await recordAuditLog({ clientId: input.clientId, actorUserId: input.actor.userId,
      action: "knowledge_suggestion.created", targetType: "knowledge_suggestion", targetId: id,
      metadata: { revision: 1, sourceId: input.sourceId ?? null } }, db);
    return id;
  };
  return input.db ? create(input.db) : transaction(create, { isolationLevel: "serializable", retries: 2 });
}

export async function reviseKnowledgeSuggestion(input: {
  actor: SessionUser; clientId: string; suggestionId: string; expectedRevision: number;
  title: string; content: string; reason: string; sourceReference?: string | null;
  outletName?: string | null;
}): Promise<number> {
  assertBusinessActor(input.actor, input.clientId);
  const title = bounded(input.title, 200, "A proposed fact title is required.");
  const content = bounded(input.content, 8000, "A proposed answer or policy is required.");
  const reason = bounded(input.reason, 1000, "Explain why this correction is needed.");
  return transaction(async (db) => {
    const row = await db.query<{ current_revision: number; created_by: string; status: string }>(
      "select current_revision, created_by, status from knowledge_suggestions where id = $1 and client_id = $2 for update",
      [input.suggestionId, input.clientId]);
    const suggestion = row.rows[0];
    if (!suggestion) throw new Error("Suggestion not found for this business.");
    if (suggestion.created_by !== input.actor.userId) throw new Error("Only the original author may revise this suggestion.");
    if (suggestion.current_revision !== input.expectedRevision) throw new Error("Suggestion changed; review the current version.");
    if (suggestion.status !== "pending" && suggestion.status !== "revision_requested" && suggestion.status !== "rejected")
      throw new Error("Approved or published suggestions require a new proposal.");
    const revision = suggestion.current_revision + 1;
    await db.query(
      `insert into knowledge_suggestion_revisions
       (suggestion_id, client_id, revision, title, content, reason, source_reference, outlet_name, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [input.suggestionId, input.clientId, revision, title, content, reason,
        optionalBounded(input.sourceReference, 500), optionalBounded(input.outletName, 200), input.actor.userId]);
    await db.query(
      `update knowledge_suggestions set current_revision = $3, status = 'pending',
       reviewed_by = null, reviewed_at = null, reviewed_revision = null, review_note = null,
       updated_at = now() where id = $1 and client_id = $2`,
      [input.suggestionId, input.clientId, revision]);
    await recordAuditLog({ clientId: input.clientId, actorUserId: input.actor.userId,
      action: "knowledge_suggestion.revised", targetType: "knowledge_suggestion", targetId: input.suggestionId,
      metadata: { revision } }, db);
    return revision;
  }, { isolationLevel: "serializable", retries: 2 });
}

export async function reviewKnowledgeSuggestion(input: {
  actor: SessionUser; clientId: string; suggestionId: string; expectedRevision: number;
  decision: "approve" | "reject" | "request_revision"; note: string;
}): Promise<void> {
  assertBusinessActor(input.actor, input.clientId);
  const note = bounded(input.note, 1000, "A review note is required.");
  await transaction(async (db) => {
    await requireStaffCapability(input.actor, input.clientId, "knowledge.approve", db);
    const row = await db.query<{ current_revision: number; status: string }>(
      "select current_revision, status from knowledge_suggestions where id = $1 and client_id = $2 for update",
      [input.suggestionId, input.clientId]);
    if (!row.rows[0]) throw new Error("Suggestion not found for this business.");
    if (row.rows[0].current_revision !== input.expectedRevision) throw new Error("Suggestion changed; review the current version.");
    if (row.rows[0].status !== "pending") throw new Error("Only pending suggestions may be reviewed.");
    const status = input.decision === "approve" ? "approved"
      : input.decision === "reject" ? "rejected" : "revision_requested";
    await db.query(
      `update knowledge_suggestions set status = $3, reviewed_by = $4,
       reviewed_at = now(), reviewed_revision = $5, review_note = $6, updated_at = now()
       where id = $1 and client_id = $2`,
      [input.suggestionId, input.clientId, status, input.actor.userId, input.expectedRevision, note]);
    await recordAuditLog({ clientId: input.clientId, actorUserId: input.actor.userId,
      action: `knowledge_suggestion.${status}`, targetType: "knowledge_suggestion", targetId: input.suggestionId,
      metadata: { revision: input.expectedRevision, note } }, db);
  }, { isolationLevel: "serializable", retries: 2 });
}

export async function stageApprovedKnowledgeSuggestion(input: {
  actor: SessionUser; clientId: string; suggestionId: string; expectedRevision: number;
}): Promise<number> {
  if (input.actor.role !== "operator") throw new Error("Pronto operator access is required.");
  const result = await query<KnowledgeSuggestion>(
    `select s.*, r.title, r.content, r.reason, r.source_reference, r.outlet_name
     from knowledge_suggestions s join knowledge_suggestion_revisions r
       on r.suggestion_id = s.id and r.client_id = s.client_id and r.revision = s.current_revision
     where s.id = $1 and s.client_id = $2`, [input.suggestionId, input.clientId]);
  const item = result.rows[0];
  if (!item || !item.reviewed_by || item.current_revision !== input.expectedRevision ||
      item.reviewed_revision !== input.expectedRevision ||
      !["approved", "staged"].includes(item.status)) throw new Error("This exact suggestion revision needs business approval.");
  if (item.status === "staged" && item.staged_edit_version) {
    const draft = await query<{ edit_version: number; knowledge_changes: Record<string, { metadata?: Record<string, unknown> }> }>(
      "select edit_version, knowledge_changes from assistant_drafts where client_id = $1", [input.clientId]);
    const change = draft.rows[0]?.knowledge_changes?.[item.target_source_id];
    if (change?.metadata?.suggestionId === item.id && change.metadata.suggestionRevision === item.current_revision)
      return draft.rows[0].edit_version;
    await query(
      `update knowledge_suggestions set status = 'approved', staged_edit_version = null, updated_at = now()
       where id = $1 and client_id = $2 and status = 'staged'`, [item.id, input.clientId]);
  }
  await stageKnowledge({ clientId: input.clientId, actorUserId: input.actor.userId,
    sourceId: item.target_source_id, allowNewSourceId: !item.source_id,
    proposalAuthorUserId: item.created_by ?? undefined, action: "upsert", title: item.title,
    content: item.content, sourceType: item.source_id ? "client_manual" : "business_correction",
    metadata: { sourceReference: item.source_reference ?? "business_suggestion",
      suggestionId: item.id, suggestionRevision: item.current_revision,
      correctionReason: item.reason, outletName: item.outlet_name,
      approvedBy: item.reviewed_by, approvedAt: item.reviewed_at } });
  const draft = await query<{ edit_version: number }>(
    "select edit_version from assistant_drafts where client_id = $1", [input.clientId]);
  const version = draft.rows[0]?.edit_version;
  if (!version) throw new Error("Assistant draft was not staged.");
  await transaction(async (db) => {
    const updated = await db.query(
      `update knowledge_suggestions set status = 'staged', staged_edit_version = $4, updated_at = now()
       where id = $1 and client_id = $2 and current_revision = $3 and status = 'approved'`,
      [input.suggestionId, input.clientId, input.expectedRevision, version]);
    if (!updated.rowCount) throw new Error("Suggestion changed while staging; review the assistant draft.");
    await recordAuditLog({ clientId: input.clientId, actorUserId: input.actor.userId,
      action: "knowledge_suggestion.staged", targetType: "knowledge_suggestion", targetId: input.suggestionId,
      metadata: { revision: input.expectedRevision, assistantEditVersion: version } }, db);
  });
  return version;
}

function assertBusinessActor(actor: SessionUser, clientId: string): void {
  if (actor.role !== "client" || actor.clientId !== clientId)
    throw new Error("A signed-in member of this business is required.");
}

function bounded(value: string, max: number, message: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) throw new Error(message);
  return trimmed;
}

function optionalBounded(value: string | null | undefined, max: number): string | null {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length > max) throw new Error("Supporting reference is too long.");
  return trimmed || null;
}
