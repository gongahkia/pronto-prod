import { createHash, randomUUID } from "node:crypto";
import { recordAuditLog } from "@/lib/audit";
import { query, transaction, vectorLiteral, type Queryable } from "@/lib/db";
import { chunkText } from "@/lib/knowledge/chunk";
import { getEmbeddingProvider } from "@/lib/llm";
import { assertConfigurationApproved } from "@/lib/managed-approvals";
import {
  compileTriageFlowToEscalationRules,
  validateAndNormalizeTriageFlow,
  type TriageFlowDraft,
} from "@/lib/triage-flow";
import type { KnowledgeChunk } from "@/lib/types";
import type { AgentConfigUpdate } from "@/lib/agent/config";

export type KnowledgeDraftChange = {
  sourceId: string;
  authorUserId?: string;
  action: "upsert" | "delete";
  title: string;
  content: string;
  sourceType: string;
  metadata: Record<string, unknown>;
};

export type VoiceDraft = {
  title: string;
  content: string;
  attributes?: Record<string, unknown>;
  sourceNotes?: string | null;
  examples: Array<{
    customerMessage: string;
    idealResponse: string;
    notes: string;
    active: boolean;
  }>;
};

export type AssistantDraft = {
  client_id: string;
  base_fingerprint: string;
  voice: VoiceDraft | null;
  flow: TriageFlowDraft | null;
  config: AgentConfigUpdate | null;
  knowledge_changes: Record<string, KnowledgeDraftChange>;
  updated_at: Date;
  edit_version: number;
  tested_at: Date | null;
};

export class DraftConflictError extends Error {
  constructor() {
    super("The live assistant changed after this draft was started. Discard the draft and review the current version before editing again.");
  }
}

export async function getAssistantDraft(clientId: string): Promise<AssistantDraft | null> {
  const result = await query<AssistantDraft>(
    "select client_id, base_fingerprint, voice, flow, config, knowledge_changes, updated_at, edit_version, tested_at from assistant_drafts where client_id = $1",
    [clientId],
  );
  return result.rows[0] ?? null;
}

export async function getAssistantRevision(clientId: string): Promise<{ revision: number; publishedAt: Date | null }> {
  const result = await query<{ revision: number; published_at: Date | null }>(
    "select revision, published_at from assistant_publications where client_id = $1",
    [clientId],
  );
  return {
    revision: result.rows[0]?.revision ?? 0,
    publishedAt: result.rows[0]?.published_at ?? null,
  };
}

async function ensureDraft(clientId: string, actorUserId: string): Promise<void> {
  const fingerprint = await liveFingerprint({ query }, clientId);
  await query(
    `insert into assistant_drafts (client_id, base_fingerprint, updated_by)
     values ($1, $2, $3)
     on conflict (client_id) do nothing`,
    [clientId, fingerprint, actorUserId],
  );
}

export async function stageVoice(input: {
  clientId: string;
  actorUserId: string;
  voice: VoiceDraft;
}): Promise<void> {
  if (!input.voice.content.trim() || !input.voice.title.trim()) {
    throw new Error("A voice guide title and content are required.");
  }
  if (input.voice.examples.length > 20) throw new Error("Keep at most 20 example replies.");
  for (const example of input.voice.examples) {
    if (!example.customerMessage.trim() || !example.idealResponse.trim()) {
      throw new Error("Each example needs a customer message and ideal reply.");
    }
  }
  await ensureDraft(input.clientId, input.actorUserId);
  await query(
    `update assistant_drafts set voice = $2::jsonb, updated_by = $3, tested_at = null,
       edit_version = edit_version + 1, updated_at = now()
     where client_id = $1`,
    [input.clientId, JSON.stringify(input.voice), input.actorUserId],
  );
}

export async function stageFlow(input: {
  clientId: string;
  actorUserId: string;
  nodes: unknown;
  edges: unknown;
}): Promise<void> {
  const flow = validateAndNormalizeTriageFlow({ nodes: input.nodes, edges: input.edges });
  await ensureDraft(input.clientId, input.actorUserId);
  await query(
    `update assistant_drafts set flow = $2::jsonb, updated_by = $3, tested_at = null,
       edit_version = edit_version + 1, updated_at = now()
     where client_id = $1`,
    [input.clientId, JSON.stringify(flow), input.actorUserId],
  );
}

export async function stageAgentConfig(input: AgentConfigUpdate): Promise<void> {
  const actor = await query<{ role: string }>("select role from users where id = $1", [input.actorUserId]);
  if (actor.rows[0]?.role !== "operator") throw new Error("Only a Pronto operator may prepare agent tuning.");
  await ensureDraft(input.clientId, input.actorUserId);
  await query(
    `update assistant_drafts set config = $2::jsonb, updated_by = $3, tested_at = null,
       edit_version = edit_version + 1, updated_at = now() where client_id = $1`,
    [input.clientId, JSON.stringify(input), input.actorUserId],
  );
}

export async function stageKnowledge(input: {
  clientId: string;
  actorUserId: string;
  sourceId?: string;
  action: "upsert" | "delete";
  title?: string;
  content?: string;
  sourceType?: string;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  await ensureDraft(input.clientId, input.actorUserId);
  const sourceId = input.sourceId ?? randomUUID();
  const draft = await getAssistantDraft(input.clientId);
  if (!draft) throw new Error("Assistant draft could not be created.");
  const existingChange = draft.knowledge_changes[sourceId];
  const existingSource = input.sourceId
    ? await query<{ title: string; content: string; source_type: string; metadata: Record<string, unknown> }>(
        "select title, content, source_type, metadata from knowledge_sources where id = $1 and client_id = $2",
        [sourceId, input.clientId],
      )
    : null;
  if (input.sourceId && !existingSource?.rows[0] && !existingChange) {
    throw new Error("Knowledge source not found.");
  }
  const source = existingSource?.rows[0];
  const changes = { ...draft.knowledge_changes };
  if (input.action === "delete" && !source) {
    delete changes[sourceId];
  } else {
    changes[sourceId] = {
      sourceId,
      authorUserId: input.actorUserId,
      action: input.action,
      title: input.title?.trim() ?? existingChange?.title ?? source?.title ?? "",
      content: input.content?.trim() ?? existingChange?.content ?? source?.content ?? "",
      sourceType: input.sourceType ?? existingChange?.sourceType ?? source?.source_type ?? "client_manual",
      metadata: {
        ...(input.metadata ?? existingChange?.metadata ?? source?.metadata ?? {}),
        proposalAuthorId: input.actorUserId,
        sourceReference: String(input.metadata?.sourceUrl ?? input.metadata?.sourceReference ??
          input.metadata?.fileName ?? input.metadata?.entryMode ?? existingChange?.metadata?.sourceReference ?? source?.metadata?.sourceUrl ??
          source?.source_type ?? input.sourceType ?? "manual_proposal"),
      },
    };
  }
  const change = changes[sourceId];
  if (change?.action === "upsert" && (!change.title || !change.content)) {
    throw new Error("A source title and content are required.");
  }
  const config = change?.action === "upsert"
    ? await query<{ embedding_model: string; embedding_provider: string }>(
        "select embedding_model, embedding_provider from agent_configs where client_id = $1",
        [input.clientId],
      )
    : null;
  const embeddingModel = process.env.PRONTO_EMBEDDING_MODEL ??
    config?.rows[0]?.embedding_model ?? process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
  const provider = process.env.PRONTO_EMBEDDING_PROVIDER ?? config?.rows[0]?.embedding_provider;
  const chunks = change?.action === "upsert"
    ? chunkText(change.content, { maxCharacters: 900, overlap: 120 })
    : [];
  const embeddings = chunks.length
    ? await getEmbeddingProvider(provider).embed(chunks.map((chunk) => chunk.content), embeddingModel)
    : [];

  await transaction(async (db) => {
    const locked = await db.query<{ knowledge_changes: Record<string, KnowledgeDraftChange> }>(
      "select knowledge_changes from assistant_drafts where client_id = $1 for update",
      [input.clientId],
    );
    if (!locked.rows[0]) throw new Error("Assistant draft could not be found.");
    const currentChanges = { ...locked.rows[0].knowledge_changes };
    if (change) currentChanges[sourceId] = change;
    else delete currentChanges[sourceId];
    await db.query("delete from assistant_draft_chunks where client_id = $1 and source_id = $2", [
      input.clientId, sourceId,
    ]);
    for (const [index, chunk] of chunks.entries()) {
      await db.query(
        `insert into assistant_draft_chunks
         (client_id, source_id, chunk_index, content, token_estimate, embedding, embedding_model, embedding_dimensions)
         values ($1, $2, $3, $4, $5, $6::vector, $7, $8)`,
        [input.clientId, sourceId, index, chunk.content, chunk.tokenEstimate,
          vectorLiteral(embeddings[index]), embeddingModel, embeddings[index].length],
      );
    }
    await db.query(
      `update assistant_drafts
       set knowledge_changes = $2::jsonb, updated_by = $3, tested_at = null,
           edit_version = edit_version + 1, updated_at = now()
       where client_id = $1`,
      [input.clientId, JSON.stringify(currentChanges), input.actorUserId],
    );
  }, { isolationLevel: "serializable", retries: 2 });
  return sourceId;
}

export async function discardAssistantDraft(clientId: string, actorUserId: string): Promise<void> {
  await transaction(async (db) => {
    await db.query("delete from assistant_draft_chunks where client_id = $1", [clientId]);
    await db.query("delete from assistant_drafts where client_id = $1", [clientId]);
    await recordAuditLog({
      clientId, actorUserId, action: "assistant_draft.discarded",
      targetType: "client", targetId: clientId,
    }, db);
  });
}

export async function markAssistantDraftTested(clientId: string, expectedVersion: number): Promise<void> {
  await query(
    "update assistant_drafts set tested_at = now() where client_id = $1 and edit_version = $2",
    [clientId, expectedVersion],
  );
}

export async function publishAssistantDraft(clientId: string, actorUserId: string): Promise<number> {
  return transaction(async (db) => {
    const actor = await db.query<{ role: string }>(
      "select role from users where id = $1", [actorUserId]);
    if (actor.rows[0]?.role !== "operator") {
      throw new Error("Only a Pronto operator may publish an approved assistant draft.");
    }
    const draftResult = await db.query<AssistantDraft>(
      "select * from assistant_drafts where client_id = $1 for update",
      [clientId],
    );
    const draft = draftResult.rows[0];
    if (!draft) throw new Error("There are no changes to publish.");
    if (!draft.tested_at) {
      throw new Error("Test the current draft before publishing it.");
    }
    await assertConfigurationApproved(db, clientId, "assistant", clientId, String(draft.edit_version));
    if (await liveFingerprint(db, clientId) !== draft.base_fingerprint) {
      throw new DraftConflictError();
    }
    for (const change of Object.values(draft.knowledge_changes)) {
      if (change.action === "delete") {
        await db.query("delete from knowledge_sources where id = $1 and client_id = $2", [
          change.sourceId, clientId,
        ]);
        continue;
      }
      const existing = await db.query<{ id: string }>(
        "select id from knowledge_sources where id = $1 and client_id = $2",
        [change.sourceId, clientId],
      );
      if (existing.rowCount) {
        await db.query(
          "update knowledge_sources set title = $3, content = $4, metadata = $5::jsonb where id = $1 and client_id = $2",
          [change.sourceId, clientId, change.title, change.content, JSON.stringify(change.metadata)],
        );
        await db.query("delete from knowledge_chunks where source_id = $1 and client_id = $2", [
          change.sourceId, clientId,
        ]);
      } else {
        await db.query(
          `insert into knowledge_sources (id, client_id, title, source_type, content, metadata)
           values ($1, $2, $3, $4, $5, $6::jsonb)`,
          [change.sourceId, clientId, change.title, change.sourceType, change.content, JSON.stringify(change.metadata)],
        );
      }
      await db.query(
        `insert into knowledge_chunks
         (source_id, client_id, chunk_index, content, token_estimate, embedding, embedding_model, embedding_dimensions)
         select source_id, client_id, chunk_index, content, token_estimate, embedding, embedding_model, embedding_dimensions
         from assistant_draft_chunks where client_id = $1 and source_id = $2`,
        [clientId, change.sourceId],
      );
      await db.query(
        `insert into knowledge_source_versions
         (source_id, client_id, version_number, title, content, metadata, change_type, actor_user_id)
         select $1, $2, coalesce(max(version_number), 0) + 1, $3, $4, $5::jsonb, $6, $7
         from knowledge_source_versions where source_id = $1 and client_id = $2`,
        [change.sourceId, clientId, change.title, change.content, JSON.stringify(change.metadata),
          existing.rowCount ? "updated" : "created", change.authorUserId ?? actorUserId],
      );
    }
    if (draft.voice) {
      const voice = draft.voice;
      await db.query(
        `insert into brand_voice_documents (client_id, title, content, attributes, source_notes)
         values ($1, $2, $3, $4::jsonb, $5)
         on conflict (client_id) do update set
           title = excluded.title, content = excluded.content,
           attributes = excluded.attributes, source_notes = excluded.source_notes, updated_at = now()`,
        [clientId, voice.title, voice.content, JSON.stringify(voice.attributes ?? {}), voice.sourceNotes ?? null],
      );
      await db.query("update clients set brand_voice = $2, updated_at = now() where id = $1", [
        clientId, voice.content,
      ]);
      await db.query("delete from brand_voice_examples where client_id = $1", [clientId]);
      for (const example of voice.examples) {
        await db.query(
          `insert into brand_voice_examples
           (client_id, customer_message, ideal_response, notes, is_active)
           values ($1, $2, $3, $4, $5)`,
          [clientId, example.customerMessage, example.idealResponse, example.notes, example.active],
        );
      }
    }
    if (draft.config) {
      const config = draft.config;
      const before = await db.query("select * from agent_configs where client_id = $1 for update", [clientId]);
      if (!before.rows[0]) throw new Error("Agent configuration is missing.");
      const after = await db.query(
        `update agent_configs set retrieval_threshold = $2, prompt_preamble = $3,
         escalation_rules = $4::jsonb, response_provider = $5, response_model = $6,
         embedding_provider = $7, embedding_model = $8, updated_at = now()
         where client_id = $1 returning *`,
        [clientId, config.retrievalThreshold, config.promptPreamble, JSON.stringify(config.escalationRules),
          config.responseProvider, config.responseModel, config.embeddingProvider, config.embeddingModel],
      );
      await db.query(
        `insert into agent_config_changes
         (client_id, actor_user_id, previous_config, new_config, change_reason)
         values ($1, $2, $3::jsonb, $4::jsonb, $5)`,
        [clientId, actorUserId, JSON.stringify(before.rows[0]), JSON.stringify(after.rows[0]),
          config.changeReason?.trim() || null],
      );
    }
    if (draft.flow) {
      const flow = validateAndNormalizeTriageFlow(draft.flow);
      const rules = compileTriageFlowToEscalationRules(flow.nodes);
      await db.query(
        `insert into triage_flows (client_id, nodes, edges, compiled_escalation_rules, published_at)
         values ($1, $2::jsonb, $3::jsonb, $4::jsonb, now())
         on conflict (client_id) do update set
           nodes = excluded.nodes, edges = excluded.edges,
           compiled_escalation_rules = excluded.compiled_escalation_rules,
           version = triage_flows.version + 1, published_at = now(), updated_at = now()`,
        [clientId, JSON.stringify(flow.nodes), JSON.stringify(flow.edges), JSON.stringify(rules)],
      );
      await db.query(
        "update agent_configs set escalation_rules = $2::jsonb, updated_at = now() where client_id = $1",
        [clientId, JSON.stringify(rules)],
      );
    }
    const revisionResult = await db.query<{ revision: number }>(
      `insert into assistant_publications (client_id, revision, published_at, published_by)
       values ($1, 1, now(), $2)
       on conflict (client_id) do update set revision = assistant_publications.revision + 1,
         published_at = now(), published_by = excluded.published_by
       returning revision`,
      [clientId, actorUserId],
    );
    await db.query("delete from assistant_draft_chunks where client_id = $1", [clientId]);
    await db.query("delete from assistant_drafts where client_id = $1", [clientId]);
    await recordAuditLog({
      clientId, actorUserId, action: "assistant_draft.published",
      targetType: "client", targetId: clientId,
      metadata: { revision: revisionResult.rows[0].revision },
    }, db);
    return revisionResult.rows[0].revision;
  }, { isolationLevel: "serializable", retries: 2 });
}

export async function retrieveDraftKnowledge(
  clientId: string,
  embedding: number[],
  model: string | null,
  queryText: string | null,
  limit = 5,
): Promise<KnowledgeChunk[]> {
  const result = await query<KnowledgeChunk & { distance: string; keyword_rank: string }>(
    `select source_id, client_id, chunk_index, content, token_estimate,
            embedding_model, embedding_dimensions, '{}'::jsonb as metadata,
            (client_id::text || ':' || source_id::text || ':' || chunk_index::text) as id,
            (embedding <=> $2::vector)::text as distance,
            case when $5::text is null then '0'
              else ts_rank_cd(to_tsvector('simple', content), websearch_to_tsquery('simple', $5))::text
            end as keyword_rank
     from assistant_draft_chunks
     where client_id = $1 and embedding_dimensions = $3
       and ($4::text is null or embedding_model = $4)
     order by least(1 - (embedding <=> $2::vector) +
       case when $5::text is null then 0 else
         least(ts_rank_cd(to_tsvector('simple', content), websearch_to_tsquery('simple', $5)) * 8, 0.75)
       end, 1) desc
     limit $6`,
    [clientId, vectorLiteral(embedding), embedding.length, model, queryText?.trim() || null, limit],
  );
  return result.rows.map((row) => ({
    ...row,
    score: Math.min(1 - Number(row.distance) + Math.min(Number(row.keyword_rank) * 8, 0.75), 1),
  }));
}

async function liveFingerprint(db: Queryable, clientId: string): Promise<string> {
  const client = await db.query("select brand_voice from clients where id = $1", [clientId]);
  const sources = await db.query("select id, title, content, source_type, metadata from knowledge_sources where client_id = $1 order by id", [clientId]);
  const voice = await db.query("select title, content, attributes, source_notes from brand_voice_documents where client_id = $1", [clientId]);
  const examples = await db.query("select customer_message, ideal_response, notes, is_active from brand_voice_examples where client_id = $1 order by id", [clientId]);
  const flow = await db.query("select nodes, edges, version from triage_flows where client_id = $1", [clientId]);
  const config = await db.query("select prompt_preamble, escalation_rules from agent_configs where client_id = $1", [clientId]);
  return createHash("sha256")
    .update(JSON.stringify([client.rows, sources.rows, voice.rows, examples.rows, flow.rows, config.rows]))
    .digest("hex");
}
