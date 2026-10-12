import { createHash, randomUUID } from "node:crypto";
import { recordAuditLog } from "@/lib/audit";
import { stageKnowledge } from "@/lib/assistant-drafts";
import type { SessionUser } from "@/lib/auth";
import { query, transaction } from "@/lib/db";
import { requireStaffCapability } from "@/lib/staff-permissions";

export type SourceSubmission = {
  id: string; client_id: string; target_source_id: string; source_type: "text" | "pdf" | "url";
  action: "upsert" | "archive"; status: string; current_revision: number;
  submitted_by: string | null; reviewed_by: string | null; reviewed_revision: number | null;
  reviewed_at: Date | null; review_note: string | null; staged_edit_version: number | null;
  extraction_error: string | null;
  title: string; description: string; outlet_name: string | null; content: string;
  content_sha256: string; source_url: string | null; metadata: Record<string, unknown>;
  created_at: Date; updated_at: Date;
};

export async function listSourceSubmissions(clientId: string): Promise<SourceSubmission[]> {
  const result = await query<SourceSubmission>(
    `select s.*, r.title, r.description, r.outlet_name, r.content, r.content_sha256,
       r.source_url, r.metadata from knowledge_source_submissions s
     join knowledge_source_submission_revisions r on r.client_id = s.client_id
       and r.submission_id = s.id and r.revision = s.current_revision
     where s.client_id = $1 order by s.updated_at desc limit 100`, [clientId]);
  return result.rows;
}

export async function submitKnowledgeSource(input: {
  actor: SessionUser; clientId: string; sourceType: "text" | "pdf" | "url";
  action?: "upsert" | "archive"; title: string; description?: string;
  content: string; sourceUrl?: string | null; outletName?: string | null;
  metadata?: Record<string, unknown>; targetSourceId?: string;
  submissionId?: string; expectedRevision?: number; requestKey?: string;
}): Promise<{ id: string; revision: number }> {
  assertActor(input.actor, input.clientId);
  if (!["text", "pdf", "url"].includes(input.sourceType) ||
      !["upsert", "archive"].includes(input.action ?? "upsert")) throw new Error("Unsupported source type or action.");
  if (input.action !== "archive" && input.sourceType === "url" &&
      (!input.sourceUrl || input.metadata?.extraction !== "bounded_html"))
    throw new Error("A URL source requires verified webpage extraction.");
  if (input.action !== "archive" && input.sourceType === "pdf" && input.metadata?.parser !== "pdf-parse")
    throw new Error("A PDF source requires verified text extraction.");
  const title = bound(input.title, 200, "Source title is required.");
  const content = input.action === "archive" ? "Archived after review." : bound(input.content, 200_000, "Source text is required or too long.");
  const description = optional(input.description, 1000);
  const outlet = optional(input.outletName, 200) || null;
  const sourceUrl = optional(input.sourceUrl, 2000) || null;
  const hash = createHash("sha256").update(content).digest("hex");
  const requestKey = input.requestKey ? bound(input.requestKey, 120, "Invalid request key.") : null;
  return transaction(async (db) => {
    if (requestKey && !input.submissionId) {
      await db.query("select pg_advisory_xact_lock(hashtext($1))", [`${input.clientId}:${input.actor.userId}:${requestKey}`]);
      const duplicate = await db.query<{ id: string; title: string; content_sha256: string;
        source_type: string; action: string; target_source_id: string }>(
        `select s.id,s.source_type,s.action,s.target_source_id,r.title,r.content_sha256 from knowledge_source_submissions s
         join knowledge_source_submission_revisions r on r.submission_id = s.id and r.revision = 1
         where s.client_id = $1 and s.submitted_by = $2 and s.request_key = $3`,
        [input.clientId, input.actor.userId, requestKey]);
      if (duplicate.rows[0]) {
        if (duplicate.rows[0].title !== title || duplicate.rows[0].content_sha256 !== hash ||
            duplicate.rows[0].source_type !== input.sourceType || duplicate.rows[0].action !== (input.action ?? "upsert") ||
            (input.targetSourceId && duplicate.rows[0].target_source_id !== input.targetSourceId))
          throw new Error("This request key was already used for different source content.");
        return { id: duplicate.rows[0].id, revision: 1 };
      }
    }
    if (input.targetSourceId) {
      const target = await db.query("select id from knowledge_sources where id = $1 and client_id = $2", [input.targetSourceId, input.clientId]);
      if (!target.rows[0]) throw new Error("Business knowledge source not found.");
    }
    const existing = input.submissionId ? await db.query<SourceSubmission>(
      "select * from knowledge_source_submissions where id = $1 and client_id = $2 for update",
      [input.submissionId, input.clientId]) : null;
    if (input.submissionId && !existing?.rows[0]) throw new Error("Source submission not found.");
    if (existing?.rows[0]) {
      const previous = existing.rows[0];
      if (previous.submitted_by !== input.actor.userId && input.actor.role !== "operator") throw new Error("Only the source author or Pronto may revise it.");
      if (previous.current_revision !== input.expectedRevision) throw new Error("Source changed; reload the current revision.");
      if (previous.target_source_id !== (input.targetSourceId ?? previous.target_source_id) ||
          previous.source_type !== input.sourceType || previous.action !== (input.action ?? "upsert"))
        throw new Error("A revision cannot change source identity or operation.");
      const revision = previous.current_revision + 1;
      await db.query(`update knowledge_source_submissions set current_revision = $3, status = 'pending',
        reviewed_by = null, reviewed_revision = null, reviewed_at = null, review_note = null,
        staged_edit_version = null, extraction_error = null, updated_at = now() where id = $1 and client_id = $2`,
        [previous.id, input.clientId, revision]);
      await insertRevision(db, { ...input, id: previous.id, revision, title, content, hash, description, outlet, sourceUrl });
      await recordAuditLog({ clientId: input.clientId, actorUserId: input.actor.userId,
        action: "knowledge_source.submitted_revision", targetType: "knowledge_source_submission", targetId: previous.id,
        metadata: { revision, sourceType: input.sourceType } }, db);
      return { id: previous.id, revision };
    }
    const id = randomUUID();
    await db.query(`insert into knowledge_source_submissions
      (id, client_id, target_source_id, source_type, action, submitted_by, request_key)
      values ($1,$2,$3,$4,$5,$6,$7)`, [id, input.clientId, input.targetSourceId ?? randomUUID(),
      input.sourceType, input.action ?? "upsert", input.actor.userId, requestKey]);
    await insertRevision(db, { ...input, id, revision: 1, title, content, hash, description, outlet, sourceUrl });
    await recordAuditLog({ clientId: input.clientId, actorUserId: input.actor.userId,
      action: "knowledge_source.submitted", targetType: "knowledge_source_submission", targetId: id,
      metadata: { sourceType: input.sourceType, action: input.action ?? "upsert" } }, db);
    return { id, revision: 1 };
  }, { isolationLevel: "serializable", retries: 2 });
}

export async function recordSourceExtractionFailure(input: { actor: SessionUser; clientId: string;
  sourceType: "text" | "pdf" | "url"; title: string; error: string }): Promise<string> {
  assertActor(input.actor, input.clientId);
  if (!["text", "pdf", "url"].includes(input.sourceType)) throw new Error("Unsupported source type.");
  const title = bound(input.title, 200, "Source title is required.");
  const reason = input.error.slice(0, 300);
  const id = randomUUID();
  const content = "";
  const hash = createHash("sha256").update(content).digest("hex");
  await transaction(async (db) => {
    await db.query(`insert into knowledge_source_submissions
      (id,client_id,target_source_id,source_type,submitted_by,status,extraction_error)
      values ($1,$2,$3,$4,$5,'validation_failed',$6)`,
      [id, input.clientId, randomUUID(), input.sourceType, input.actor.userId, reason]);
    await db.query(`insert into knowledge_source_submission_revisions
      (submission_id,client_id,revision,title,content,content_sha256,created_by)
      values ($1,$2,1,$3,$4,$5,$6)`, [id, input.clientId, title, content, hash, input.actor.userId]);
    await recordAuditLog({ clientId: input.clientId, actorUserId: input.actor.userId,
      action: "knowledge_source.extraction_failed", targetType: "knowledge_source_submission", targetId: id,
      metadata: { sourceType: input.sourceType } }, db);
  });
  return id;
}

async function insertRevision(db: Parameters<Parameters<typeof transaction>[0]>[0], input: {
  id: string; revision: number; clientId: string; actor: SessionUser; title: string; description: string;
  outlet: string | null; content: string; hash: string; sourceUrl: string | null;
  metadata?: Record<string, unknown>;
}) {
  await db.query(`insert into knowledge_source_submission_revisions
    (submission_id,client_id,revision,title,description,outlet_name,content,content_sha256,source_url,metadata,created_by)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)`, [input.id, input.clientId,
    input.revision, input.title, input.description, input.outlet, input.content, input.hash,
    input.sourceUrl, JSON.stringify(input.metadata ?? {}), input.actor.userId]);
}

export async function reviewSourceSubmission(input: { actor: SessionUser; clientId: string;
  submissionId: string; expectedRevision: number; decision: "approve" | "reject" | "request_revision";
  note: string;
}): Promise<void> {
  if (input.actor.role !== "client" || input.actor.clientId !== input.clientId) throw new Error("Business reviewer required.");
  const note = bound(input.note, 1000, "Review note is required.");
  await transaction(async (db) => {
    await requireStaffCapability(input.actor, input.clientId, "knowledge.approve", db);
    const row = await db.query<SourceSubmission>("select * from knowledge_source_submissions where id = $1 and client_id = $2 for update",
      [input.submissionId, input.clientId]);
    if (!row.rows[0]) throw new Error("Source submission not found.");
    if (row.rows[0].current_revision !== input.expectedRevision) throw new Error("Source changed; reload the current revision.");
    if (row.rows[0].status !== "pending") throw new Error("Only pending sources may be reviewed.");
    const status = input.decision === "approve" ? "approved" : input.decision === "reject" ? "rejected" : "revision_requested";
    await db.query(`update knowledge_source_submissions set status = $3, reviewed_by = $4,
      reviewed_revision = $5, reviewed_at = now(), review_note = $6, updated_at = now()
      where id = $1 and client_id = $2`, [input.submissionId, input.clientId, status,
      input.actor.userId, input.expectedRevision, note]);
    await recordAuditLog({ clientId: input.clientId, actorUserId: input.actor.userId,
      action: `knowledge_source.${status}`, targetType: "knowledge_source_submission", targetId: input.submissionId,
      metadata: { revision: input.expectedRevision } }, db);
  }, { isolationLevel: "serializable", retries: 2 });
}

export async function stageApprovedSourceSubmission(input: { actor: SessionUser; clientId: string;
  submissionId: string; expectedRevision: number }): Promise<number> {
  if (input.actor.role !== "operator") throw new Error("Pronto operator required.");
  const result = await query<SourceSubmission>(`select s.*, r.title, r.content, r.description,
    r.outlet_name, r.source_url, r.content_sha256, r.metadata
    from knowledge_source_submissions s join knowledge_source_submission_revisions r
      on r.submission_id = s.id and r.client_id = s.client_id and r.revision = s.current_revision
    where s.id = $1 and s.client_id = $2`, [input.submissionId, input.clientId]);
  const source = result.rows[0];
  if (!source || source.status !== "approved" || !source.reviewed_by || !source.submitted_by ||
      source.reviewed_revision !== input.expectedRevision || source.current_revision !== input.expectedRevision)
    throw new Error("This exact source revision needs business approval.");
  const reviewer = await query("select id from users where id = $1 and client_id = $2 and role = 'client'",
    [source.reviewed_by, input.clientId]);
  if (!reviewer.rows[0]) throw new Error("Source reviewer identity is unavailable.");
  await stageKnowledge({ clientId: input.clientId, actorUserId: input.actor.userId,
    proposalAuthorUserId: source.submitted_by, sourceId: source.target_source_id,
    allowNewSourceId: source.action === "upsert", action: source.action === "archive" ? "delete" : "upsert",
    title: source.title, content: source.content, sourceType: source.source_type,
    metadata: { ...source.metadata, submissionId: source.id, submissionRevision: source.current_revision,
      contentSha256: source.content_sha256, sourceUrl: source.source_url, outletName: source.outlet_name,
      description: source.description, approvedBy: source.reviewed_by, approvedAt: source.reviewed_at } });
  const draft = await query<{ edit_version: number }>("select edit_version from assistant_drafts where client_id = $1", [input.clientId]);
  const version = draft.rows[0]?.edit_version;
  if (!version) throw new Error("Assistant draft was not staged.");
  const updated = await query(`update knowledge_source_submissions set status = 'staged', staged_edit_version = $4,
    updated_at = now() where id = $1 and client_id = $2 and current_revision = $3 and status = 'approved'`,
    [input.submissionId, input.clientId, input.expectedRevision, version]);
  if (!updated.rowCount) throw new Error("Source changed while staging; inspect the assistant draft.");
  return version;
}

function assertActor(actor: SessionUser, clientId: string) {
  if (actor.role !== "operator" && (actor.role !== "client" || actor.clientId !== clientId))
    throw new Error("Access to this business is required.");
}
function bound(value: string, max: number, message: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) throw new Error(message);
  return trimmed;
}
function optional(value: string | null | undefined, max: number): string {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length > max) throw new Error("Source metadata is too long.");
  return trimmed;
}
