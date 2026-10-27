import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { getAssistantDraft, publishAssistantDraft, stageVoice } from "@/lib/assistant-drafts";
import { approveConfiguration } from "@/lib/managed-approvals";
import { submitKnowledgeSource, reviewSourceSubmission, stageApprovedSourceSubmission } from "@/lib/knowledge/submissions";
import { createKnowledgeSuggestion, reviewKnowledgeSuggestion, stageApprovedKnowledgeSuggestion } from "@/lib/knowledge/suggestions";
import { retrieveKnowledge, retrieveKnowledgeText } from "@/lib/knowledge/retrieve";
import { hasOnlyProtectedDemoKnowledge } from "@/lib/knowledge/protected-demo";
import { DEMO_CLIENT_ID } from "@/lib/customer-demo-boundary";
import { createDemoSession, sendDemoMessage, getDemoState } from "@/lib/customer-demo";
import { setupCustomerSimulator } from "@/lib/customer-demo-setup";
import { processInboundJob } from "@/lib/channels/inbox-worker";
import { flushRetryableOutboundMessages } from "@/lib/channels/outbox";
import { FreeTierProvider } from "@/lib/llm/free-providers";
import { OpenAiProvider } from "@/lib/llm/openai";
import { deterministicEmbedding } from "@/lib/llm/mock";
import {
  setupPsCafeDemo, removePsCafeDemo, PS_CAFE_DEMO_RESPONDER_ID, PS_CAFE_DEMO_APPROVER_ID,
} from "../../scripts/demo/ps-cafe-raffles-city";

const dbDescribe = process.env.PRONTO_RUN_DB_TESTS === "1" ? describe : describe.skip;
const staff: SessionUser = { userId: PS_CAFE_DEMO_RESPONDER_ID, clientId: DEMO_CLIENT_ID,
  role: "client", name: "Synthetic responder", email: "responder@ps-cafe-demo.test" };
const approver: SessionUser = { ...staff, userId: PS_CAFE_DEMO_APPROVER_ID, email: "approver@ps-cafe-demo.test" };
const content = "Guests may borrow a violet umbrella from the front desk.";

dbDescribe("Groq-only knowledge publication with real isolated PostgreSQL", () => {
  let operator: SessionUser;

  beforeEach(async () => {
    operator = { userId: randomUUID(), clientId: null, role: "operator", name: "Synthetic operator",
      email: `${randomUUID()}@operator.test` };
    vi.stubEnv("PRONTO_CUSTOMER_DEMO_ENABLED", "1");
    vi.stubEnv("PRONTO_SECRETS_KEY", "synthetic-test-secrets-material-more-than-32-chars");
    await removePsCafeDemo();
    await setupPsCafeDemo();
    await setupCustomerSimulator();
    // Hosted fixtures explicitly retain this marker. Do not alter a real demo DB.
    await getPool().query(`update knowledge_sources set metadata = metadata || '{"approvedByRestaurant":false}'::jsonb
      where client_id = $1`, [DEMO_CLIENT_ID]);
    await getPool().query("insert into users(id,email,name,role,password_hash) values($1,$2,$3,'operator','unused')",
      [operator.userId, operator.email, operator.name]);
    vi.stubEnv("PRONTO_USE_MOCK_AI", "0");
    vi.stubEnv("GROQ_API_KEY", "synthetic-not-live");
    vi.stubEnv("PRONTO_GROQ_FREE_TIER_CONFIRMED", "1");
    vi.stubEnv("PRONTO_DEMO_REAL_AI_APPROVED", "1");
    for (const key of ["OPENAI_API_KEY", "AZURE_OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"])
      vi.stubEnv(key, "");
    vi.spyOn(OpenAiProvider.prototype, "embed");
    vi.spyOn(FreeTierProvider.prototype, "embed");
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    try {
      await removePsCafeDemo();
      await getPool().query("delete from users where id=$1", [operator.userId]);
    } finally { vi.unstubAllEnvs(); }
  });
  afterAll(async () => { await getPool().end(); });

  async function submit(targetSourceId?: string) {
    return submitKnowledgeSource({ actor: staff, clientId: DEMO_CLIENT_ID, sourceType: "text",
      title: "Synthetic umbrella policy", content, targetSourceId });
  }
  async function review(id: string, revision = 1) {
    await reviewSourceSubmission({ actor: approver, clientId: DEMO_CLIENT_ID, submissionId: id,
      expectedRevision: revision, decision: "approve", note: "Reviewed synthetic demo fact." });
  }
  async function approveDraft() {
    const draft = await getAssistantDraft(DEMO_CLIENT_ID);
    await approveConfiguration({ actor: approver, clientId: DEMO_CLIENT_ID, kind: "assistant",
      targetId: DEMO_CLIENT_ID, revision: String(draft!.edit_version), evidence: "Reviewed exact synthetic assistant revision." });
  }
  async function publish(id: string, revision = 1) {
    await stageApprovedSourceSubmission({ actor: operator, clientId: DEMO_CLIENT_ID, submissionId: id, expectedRevision: revision });
    await approveDraft();
    await publishAssistantDraft(DEMO_CLIENT_ID, operator.userId);
  }
  function noEmbeddings() {
    expect(OpenAiProvider.prototype.embed).not.toHaveBeenCalled();
    expect(FreeTierProvider.prototype.embed).not.toHaveBeenCalled();
  }

  it("keeps text outside live retrieval until both approvals and operator publication, then uses it in the Groq conversation", async () => {
    const vectorsBefore = (await getPool().query("select id,embedding::text from knowledge_chunks where client_id=$1 order by id", [DEMO_CLIENT_ID])).rows;
    const source = await submit();
    expect(await retrieveKnowledgeText(DEMO_CLIENT_ID, "violet OR umbrella")).toEqual([]);
    await expect(stageApprovedSourceSubmission({ actor: operator, clientId: DEMO_CLIENT_ID,
      submissionId: source.id, expectedRevision: 1 })).rejects.toThrow("business approval");
    await review(source.id);
    await stageApprovedSourceSubmission({ actor: operator, clientId: DEMO_CLIENT_ID, submissionId: source.id, expectedRevision: 1 });
    const draftChunks = await getPool().query("select embedding,embedding_model,embedding_dimensions,metadata from assistant_draft_chunks where client_id=$1", [DEMO_CLIENT_ID]);
    expect(draftChunks.rows).toEqual([expect.objectContaining({ embedding: null, embedding_model: "none",
      embedding_dimensions: 0, metadata: { retrievalMode: "local_text", retrievalProfile: "postgres-fts-simple-v1" } })]);
    expect(await retrieveKnowledgeText(DEMO_CLIENT_ID, "violet OR umbrella")).toEqual([]);
    await expect(publishAssistantDraft(DEMO_CLIENT_ID, operator.userId)).rejects.toThrow("business approval");
    await approveDraft();
    await stageVoice({ clientId: DEMO_CLIENT_ID, actorUserId: staff.userId,
      voice: { title: "Demo style", content: "Reply concisely using approved facts.", examples: [] } });
    await expect(publishAssistantDraft(DEMO_CLIENT_ID, operator.userId)).rejects.toThrow("business approval");
    await approveDraft();
    await expect(publishAssistantDraft(DEMO_CLIENT_ID, approver.userId)).rejects.toThrow("Pronto operator");
    await publishAssistantDraft(DEMO_CLIENT_ID, operator.userId);
    const chunks = await retrieveKnowledgeText(DEMO_CLIENT_ID, "violet OR umbrella");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].metadata).toMatchObject({ approvalEvidence: "business_review", sourceVersion: 1 });
    expect(await retrieveKnowledgeText(randomUUID(), "violet OR umbrella")).toEqual([]);
    expect(await hasOnlyProtectedDemoKnowledge()).toBe(true);
    const vectorResults = await retrieveKnowledge(DEMO_CLIENT_ID, deterministicEmbedding(content), 20, { queryText: "violet OR umbrella" });
    expect(vectorResults.some(chunk => chunk.source_id === chunks[0].source_id)).toBe(false);
    const vectorsAfter = (await getPool().query("select id,embedding::text from knowledge_chunks where client_id=$1 and embedding is not null order by id", [DEMO_CLIENT_ID])).rows;
    expect(vectorsAfter).toEqual(vectorsBefore);

    // Explicit fake inference; persistence and publication use the real services.
    vi.spyOn(FreeTierProvider.prototype, "generateGroundedAnswer").mockImplementation(async input => ({
      action: "answer", answer: content, confidence: 0.99, reasonCode: "grounded_answer",
      reasonDetail: "Explicit synthetic provider fixture, not live inference acceptance.",
      citedChunkIds: [input.retrievedChunks.find(chunk => chunk.source_id === chunks[0].source_id)!.id],
      actualModel: input.responseModel, providerResponseId: "synthetic-knowledge-publication",
    }));
    const session = await createDemoSession(staff, "real", "groq-oss");
    const job = await sendDemoMessage(staff, { sessionId: session.id, requestId: randomUUID(), text: "May I borrow a violet umbrella?" });
    expect(await processInboundJob({ jobId: job.jobId })).toMatchObject({ outcome: "answered" });
    await flushRetryableOutboundMessages();
    expect((await getDemoState(staff, session.id)).messages).toContainEqual(expect.objectContaining({
      body: expect.stringContaining(content), response_provider: "groq",
    }));
    noEmbeddings();
  });

  it("preserves the published version during new review and rejects a stale staged revision", async () => {
    const source = await submit(); await review(source.id); await publish(source.id);
    const changed = await submitKnowledgeSource({ actor: staff, clientId: DEMO_CLIENT_ID, sourceType: "text",
      submissionId: source.id, expectedRevision: 1, title: "Updated umbrella policy", content: "Guests may borrow a golden umbrella." });
    expect(await hasOnlyProtectedDemoKnowledge()).toBe(true);
    expect((await retrieveKnowledgeText(DEMO_CLIENT_ID, "violet OR umbrella"))[0].content).toBe(content);
    await review(source.id, changed.revision);
    await stageApprovedSourceSubmission({ actor: operator, clientId: DEMO_CLIENT_ID, submissionId: source.id, expectedRevision: changed.revision });
    await approveDraft();
    await submitKnowledgeSource({ actor: staff, clientId: DEMO_CLIENT_ID, sourceType: "text", submissionId: source.id,
      expectedRevision: changed.revision, title: "Latest umbrella policy", content: "Guests may borrow a silver umbrella." });
    await expect(publishAssistantDraft(DEMO_CLIENT_ID, operator.userId)).rejects.toThrow("changed after business review");
    expect((await retrieveKnowledgeText(DEMO_CLIENT_ID, "violet OR umbrella"))[0].content).toBe(content);
    expect(await hasOnlyProtectedDemoKnowledge()).toBe(true);
    noEmbeddings();
  });

  it("publishes reviewed corrections without embeddings and archives through the existing gates", async () => {
    const suggestionId = await createKnowledgeSuggestion({ actor: staff, clientId: DEMO_CLIENT_ID,
      title: "Synthetic umbrella policy", content, reason: "Synthetic POC demonstration." });
    await reviewKnowledgeSuggestion({ actor: approver, clientId: DEMO_CLIENT_ID, suggestionId,
      expectedRevision: 1, decision: "approve", note: "Reviewed synthetic correction." });
    await stageApprovedKnowledgeSuggestion({ actor: operator, clientId: DEMO_CLIENT_ID, suggestionId, expectedRevision: 1 });
    await approveDraft(); await publishAssistantDraft(DEMO_CLIENT_ID, operator.userId);
    expect(await hasOnlyProtectedDemoKnowledge()).toBe(true);
    const sourceId = (await retrieveKnowledgeText(DEMO_CLIENT_ID, "violet OR umbrella"))[0].source_id;
    const archive = await submitKnowledgeSource({ actor: staff, clientId: DEMO_CLIENT_ID, targetSourceId: sourceId,
      action: "archive", sourceType: "text", title: "Retire synthetic policy", content: "Archived after review." });
    await review(archive.id); await publish(archive.id);
    expect(await retrieveKnowledgeText(DEMO_CLIENT_ID, "violet OR umbrella")).toEqual([]);
    expect(await hasOnlyProtectedDemoKnowledge()).toBe(true);
    noEmbeddings();
  });

  it("rejects forged review metadata, missing publication evidence and malformed non-vector storage", async () => {
    const source = await submit(); await review(source.id); await publish(source.id);
    const sourceId = (await retrieveKnowledgeText(DEMO_CLIENT_ID, "violet OR umbrella"))[0].source_id;
    await getPool().query("delete from knowledge_source_versions where client_id=$1 and source_id=$2", [DEMO_CLIENT_ID, sourceId]);
    expect(await hasOnlyProtectedDemoKnowledge()).toBe(false);
    await expect(getPool().query("update knowledge_chunks set metadata='{}'::jsonb where client_id=$1 and source_id=$2", [DEMO_CLIENT_ID, sourceId]))
      .rejects.toMatchObject({ code: "23514" });
    await getPool().query("delete from knowledge_sources where client_id=$1 and id=$2", [DEMO_CLIENT_ID, sourceId]);
    await getPool().query(`insert into knowledge_sources(client_id,title,source_type,content,metadata)
      values($1,'Forged review','text',$2,$3::jsonb)`, [DEMO_CLIENT_ID, content, JSON.stringify({
      syntheticDemo: true, approvedByRestaurant: false, approvedBy: approver.userId, approvedAt: new Date().toISOString(),
      submissionId: source.id, submissionRevision: 1,
    })]);
    expect(await hasOnlyProtectedDemoKnowledge()).toBe(false);
    noEmbeddings();
  });

  it("does not permit text-only storage for another business", async () => {
    const clientId = randomUUID(), sourceId = randomUUID();
    await getPool().query("insert into clients(id,name,slug,vertical,brand_voice) values($1,'Foreign fixture',$2,'test','Test')", [clientId, clientId]);
    try {
      await getPool().query("insert into knowledge_sources(id,client_id,title,source_type,content) values($1,$2,'Foreign source','text',$3)",
        [sourceId, clientId, content]);
      await expect(getPool().query(`insert into knowledge_chunks(source_id,client_id,chunk_index,content,token_estimate,
        embedding,embedding_model,embedding_dimensions,metadata) values($1,$2,0,$3,10,null,'none',0,
        '{"retrievalMode":"local_text","retrievalProfile":"postgres-fts-simple-v1"}'::jsonb)`, [sourceId, clientId, content]))
        .rejects.toMatchObject({ code: "23514" });
    } finally { await getPool().query("delete from clients where id=$1", [clientId]); }
    noEmbeddings();
  });
});
