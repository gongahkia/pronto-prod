import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { approveConfiguration } from "@/lib/managed-approvals";
import { markAssistantDraftTested, publishAssistantDraft } from "@/lib/assistant-drafts";
import { submitKnowledgeSource, reviewSourceSubmission, stageApprovedSourceSubmission, listSourceSubmissions, recordSourceExtractionFailure } from "@/lib/knowledge/submissions";
import { setStaffCapability } from "@/lib/staff-permissions";
import { retrieveKnowledge, retrieveKnowledgeText } from "@/lib/knowledge/retrieve";
import { deterministicEmbedding } from "@/lib/llm/mock";
import { getBusinessAttention } from "@/lib/business-portal";
import { enqueueStaffNotification, flushStaffNotifications, markExpiredStaffNotificationsUncertain } from "@/lib/staff-notifications";
import { getEscalationPolicy, saveEscalationPolicy, saveStaffDestination } from "@/lib/staff-configuration";
import { enqueueKnowledgeReviewItem, listKnowledgeReviewItems, suggestAnswerForReviewItem } from "@/lib/knowledge/review-items";
import { reviewKnowledgeSuggestion, stageApprovedKnowledgeSuggestion } from "@/lib/knowledge/suggestions";
import { extractPdfSource, extractUrlSource } from "@/lib/knowledge/source-extract";
import { textPdf } from "../fixtures/text-pdf";

const dbDescribe = process.env.PRONTO_RUN_DB_TESTS === "1" ? describe : describe.skip;
dbDescribe("Tranche C source review, knowledge feedback and timed escalation", () => {
  let first: string; let second: string; let operator: SessionUser; let approver: SessionUser;
  let staff: SessionUser; let outsider: SessionUser;
  beforeEach(async () => {
    vi.stubEnv("PRONTO_USE_MOCK_AI", "1");
    [first, second] = [randomUUID(), randomUUID()];
    for (const id of [first, second]) {
      await getPool().query("insert into clients(id,name,slug,vertical,brand_voice) values ($1,'Source test',$2,'test','Clear')",
        [id, `tranche-c-${id}`]);
      await getPool().query("insert into agent_configs(client_id,prompt_preamble) values ($1,'Use reviewed facts')", [id]);
    }
    async function makeUser(role: "client" | "operator", clientId: string | null): Promise<SessionUser> {
      const userId = randomUUID(); const email = `tranche-c-${userId}@example.test`;
      await getPool().query("insert into users(id,client_id,email,name,role,password_hash) values ($1,$2,$3,'Test user',$4,'unused')",
        [userId, clientId, email, role]);
      return { userId, clientId, role, email, name: "Test user" };
    }
    operator = await makeUser("operator", null);
    approver = await makeUser("client", first);
    staff = await makeUser("client", first);
    outsider = await makeUser("client", second);
  });
  afterEach(async () => {
    await getPool().query("delete from clients where id = any($1::uuid[])", [[first, second]]);
    await getPool().query("delete from users where id = $1", [operator.userId]);
    vi.unstubAllEnvs();
  });
  afterAll(async () => { await getPool().end(); });

  async function grant(permission: "knowledge.approve" | "escalation.policy.manage" | "conversation.respond", user: SessionUser) {
    await setStaffCapability({ actor: operator, clientId: first, userId: user.userId,
      capability: permission, granted: true, evidence: "Synthetic test delegation" });
  }
  async function publishSource(submissionId: string, revision: number) {
    const draftVersion = await stageApprovedSourceSubmission({ actor: operator, clientId: first,
      submissionId, expectedRevision: revision });
    await markAssistantDraftTested(first, draftVersion);
    await approveConfiguration({ actor: approver, clientId: first, kind: "assistant", targetId: first,
      revision: String(draftVersion), evidence: "Synthetic reviewed test" });
    await publishAssistantDraft(first, operator.userId);
  }

  it("keeps text pending, requires exact approval and publication, then archives active retrieval", async () => {
    const submitted = await submitKnowledgeSource({ actor: staff, clientId: first, sourceType: "text",
      title: "Weekend menu", content: "Vegetarian pasta is listed on the weekend menu.",
      description: "Owner-provided menu", outletName: "Raffles City" });
    expect((await listSourceSubmissions(first))[0]).toMatchObject({ id: submitted.id, status: "pending", current_revision: 1 });
    expect(await retrieveKnowledge(first, deterministicEmbedding("vegetarian pasta"), 5, { queryText: "vegetarian pasta" })).toEqual([]);
    await expect(reviewSourceSubmission({ actor: staff, clientId: first, submissionId: submitted.id,
      expectedRevision: 1, decision: "approve", note: "Self approval" })).rejects.toThrow("knowledge.approve");
    await grant("knowledge.approve", approver);
    await expect(reviewSourceSubmission({ actor: outsider, clientId: second, submissionId: submitted.id,
      expectedRevision: 1, decision: "approve", note: "Wrong tenant" })).rejects.toThrow();
    await reviewSourceSubmission({ actor: approver, clientId: first, submissionId: submitted.id,
      expectedRevision: 1, decision: "approve", note: "Synthetic menu reviewed" });
    await expect(stageApprovedSourceSubmission({ actor: staff, clientId: first, submissionId: submitted.id,
      expectedRevision: 1 })).rejects.toThrow("Pronto operator");
    expect(await retrieveKnowledgeText(first,"vegetarian OR pasta")).toEqual([]);
    await publishSource(submitted.id, 1);
    expect((await retrieveKnowledgeText(first,"vegetarian OR pasta"))[0].metadata).toMatchObject({sourceVersion:1,approvalEvidence:"business_review"});
    const source = (await getPool().query<{ id: string }>(
      "select id from knowledge_sources where client_id = $1 and content like '%Vegetarian pasta%'", [first])).rows[0];
    expect(source.id).toBeTruthy();
    expect((await retrieveKnowledge(first, deterministicEmbedding("vegetarian pasta"), 5,
      { queryText: "vegetarian pasta" })).length).toBeGreaterThan(0);
    const replacementPdf = await extractPdfSource(new File([textPdf("Vegetarian pasta remains on this revised menu.")],
      "revised-menu.pdf", { type: "application/pdf" }));
    const replacement = await submitKnowledgeSource({ actor: staff, clientId: first, targetSourceId: source.id,
      sourceType: "pdf", title: "Revised weekend menu", content: replacementPdf.content,
      metadata: replacementPdf.metadata });
    await reviewSourceSubmission({ actor: approver, clientId: first, submissionId: replacement.id,
      expectedRevision: 1, decision: "approve", note: "Reviewed replacement" });
    await publishSource(replacement.id, 1);
    expect((await getPool().query("select source_type from knowledge_sources where id = $1", [source.id])).rows[0].source_type).toBe("pdf");
    const archived = await submitKnowledgeSource({ actor: staff, clientId: first, targetSourceId: source.id,
      sourceType: "text", action: "archive", title: "Weekend menu", content: "Archived after review." });
    expect((await retrieveKnowledge(first, deterministicEmbedding("vegetarian pasta"), 5,
      { queryText: "vegetarian pasta" })).length).toBeGreaterThan(0);
    await reviewSourceSubmission({ actor: approver, clientId: first, submissionId: archived.id,
      expectedRevision: 1, decision: "approve", note: "Remove obsolete menu" });
    await publishSource(archived.id, 1);
    expect(await retrieveKnowledge(first, deterministicEmbedding("vegetarian pasta"), 5,
      { queryText: "vegetarian pasta" })).toEqual([]);
    expect(await retrieveKnowledgeText(first,"vegetarian OR pasta")).toEqual([]);
    expect((await getPool().query("select metadata->>'archived' as archived from knowledge_sources where id = $1", [source.id])).rows[0].archived).toBe("true");
    expect((await getPool().query("select change_type from knowledge_source_versions where source_id = $1 order by version_number desc limit 1", [source.id])).rows[0].change_type).toBe("archived");
  });

  it("rejects stale source review and stages only the newest reviewed revision", async () => {
    const firstRevision = await submitKnowledgeSource({ actor: staff, clientId: first, sourceType: "text",
      title: "Hours", content: "Weekday hours require verification.", requestKey: "hours-1" });
    expect(await submitKnowledgeSource({ actor: staff, clientId: first, sourceType: "text",
      title: "Hours", content: "Weekday hours require verification.", requestKey: "hours-1" })).toEqual(firstRevision);
    await expect(submitKnowledgeSource({ actor: staff, clientId: first, sourceType: "text",
      title: "Hours", content: "Different text", requestKey: "hours-1" })).rejects.toThrow("already used");
    const secondRevision = await submitKnowledgeSource({ actor: staff, clientId: first, sourceType: "text",
      submissionId: firstRevision.id, expectedRevision: 1, title: "Hours", content: "Weekday hours are 10am to 8pm." });
    await grant("knowledge.approve", approver);
    await expect(reviewSourceSubmission({ actor: approver, clientId: first, submissionId: firstRevision.id,
      expectedRevision: 1, decision: "approve", note: "Stale" })).rejects.toThrow("changed");
    await reviewSourceSubmission({ actor: approver, clientId: first, submissionId: firstRevision.id,
      expectedRevision: secondRevision.revision, decision: "approve", note: "Reviewed" });
    await publishSource(firstRevision.id, secondRevision.revision);
    expect((await getPool().query("select content from knowledge_sources where client_id = $1", [first])).rows[0].content)
      .toContain("10am to 8pm");
  });

  it("fails closed if a source approver is removed before operator staging", async () => {
    await grant("knowledge.approve", approver);
    const submitted = await submitKnowledgeSource({ actor: staff, clientId: first, sourceType: "text",
      title: "Former reviewer", content: "This fact needs a current business reviewer." });
    await reviewSourceSubmission({ actor: approver, clientId: first, submissionId: submitted.id,
      expectedRevision: 1, decision: "approve", note: "Synthetic approval" });
    await getPool().query("delete from users where id = $1 and client_id = $2", [approver.userId, first]);
    await expect(stageApprovedSourceSubmission({ actor: operator, clientId: first, submissionId: submitted.id,
      expectedRevision: 1 })).rejects.toThrow("business approval");
  });

  it("records a parsing failure without publishing it and accepts a corrected revision", async () => {
    const id = await recordSourceExtractionFailure({ actor: staff, clientId: first,
      sourceType: "pdf", title: "Unreadable menu", error: "This PDF has too little selectable text." });
    expect((await listSourceSubmissions(first))[0]).toMatchObject({ id, status: "validation_failed",
      extraction_error: "This PDF has too little selectable text." });
    expect((await getPool().query("select count(*)::int as n from knowledge_sources where client_id = $1", [first])).rows[0].n).toBe(0);
    const pdf = await extractPdfSource(new File([textPdf("This corrected menu has selectable text for review.")],
      "corrected-menu.pdf", { type: "application/pdf" }));
    const corrected = await submitKnowledgeSource({ actor: staff, clientId: first, sourceType: "pdf",
      submissionId: id, expectedRevision: 1, title: "Corrected menu", content: pdf.content, metadata: pdf.metadata });
    expect(corrected).toEqual({ id, revision: 2 });
    expect((await listSourceSubmissions(first))[0]).toMatchObject({ status: "pending", extraction_error: null });
    expect((await getPool().query("select count(*)::int as n from knowledge_sources where client_id = $1", [first])).rows[0].n).toBe(0);
  });

  it("accepts a text PDF and controlled webpage only after business and assistant gates", async () => {
    await grant("knowledge.approve", approver);
    const pdf = await extractPdfSource(new File([textPdf("The demo menu lists vegetarian pasta for lunch.")],
      "demo-menu.pdf", { type: "application/pdf" }));
    const page = await extractUrlSource("https://example.com/demo-policy", {
      resolve: async () => [{ address: "8.8.8.8", family: 4 }],
      transport: async () => ({ status: 200, headers: { "content-type": "text/html" },
        body: Buffer.from("<h1>Returns</h1><p>Demo policy says to ask staff before making a return.</p>") }),
    });
    const submissions = await Promise.all([
      submitKnowledgeSource({ actor: staff, clientId: first, sourceType: pdf.sourceType,
        title: "Demo PDF menu", content: pdf.content, metadata: pdf.metadata }),
      submitKnowledgeSource({ actor: staff, clientId: first, sourceType: page.sourceType,
        title: "Demo URL policy", content: page.content, sourceUrl: page.sourceUrl, metadata: page.metadata }),
    ]);
    expect((await getPool().query("select count(*)::int as n from knowledge_sources where client_id = $1", [first])).rows[0].n).toBe(0);
    for (const submission of submissions) {
      await reviewSourceSubmission({ actor: approver, clientId: first, submissionId: submission.id,
        expectedRevision: 1, decision: "approve", note: "Synthetic source review" });
      await stageApprovedSourceSubmission({ actor: operator, clientId: first, submissionId: submission.id,
        expectedRevision: 1 });
    }
    const draft = (await getPool().query<{ edit_version: number }>("select edit_version from assistant_drafts where client_id = $1", [first])).rows[0];
    await markAssistantDraftTested(first, draft.edit_version);
    await approveConfiguration({ actor: approver, clientId: first, kind: "assistant", targetId: first,
      revision: String(draft.edit_version), evidence: "Synthetic private review" });
    await publishAssistantDraft(first, operator.userId);
    const sources = (await getPool().query<{ source_type: string; metadata: Record<string, unknown> }>(
      "select source_type,metadata from knowledge_sources where client_id = $1 order by source_type", [first])).rows;
    expect(sources.map((source) => source.source_type)).toEqual(["pdf", "url"]);
    expect(sources[0].metadata.contentSha256).toBeTruthy();
    expect(sources[1].metadata.sourceUrl).toBe("https://example.com/demo-policy");
  });

  it("queues an unanswered question once, links a correction and leaves human ownership unchanged", async () => {
    const channelId = randomUUID(); const conversationId = randomUUID(); const messageId = randomUUID(); const escalationId = randomUUID();
    await getPool().query("insert into channels(id,client_id,kind,name,status) values ($1,$2,'email','Support','draft')", [channelId, first]);
    await getPool().query("insert into conversations(id,client_id,channel_id,external_thread_id,status) values ($1,$2,$3,'review-thread','escalated')", [conversationId, first, channelId]);
    await getPool().query("insert into messages(id,client_id,channel_id,conversation_id,external_message_id,sender_role,body) values ($1,$2,$3,$4,'review-message','customer','What is the weekend cutoff?')",
      [messageId, first, channelId, conversationId]);
    await getPool().query("insert into escalations(id,client_id,conversation_id,message_id,reason_code,reason_detail) values ($1,$2,$3,$4,'knowledge_conflict','Sources differ')",
      [escalationId, first, conversationId, messageId]);
    await getPool().query("insert into knowledge_sources(client_id,title,source_type,content,metadata) values ($1,'Reservation source','curated','Cutoff withheld',$2::jsonb)",
      [first, JSON.stringify({ reviewStatus: "policy_conflict_withheld", sourceUrl: "https://example.test/policy",
        conflictingClaims: [{ cutoff: "17:30" }, { cutoff: "18:00" }] })]);
    const input = { clientId: first, conversationId, messageId, escalationId, reasonCode: "knowledge_conflict" };
    await enqueueKnowledgeReviewItem(getPool(), input); await enqueueKnowledgeReviewItem(getPool(), input);
    const items = await listKnowledgeReviewItems(first);
    expect(items).toHaveLength(1);
    expect(items[0].source_references[0].conflictingClaims).toHaveLength(2);
    expect(await listKnowledgeReviewItems(second)).toEqual([]);
    await expect(suggestAnswerForReviewItem({ actor: outsider, clientId: second, reviewItemId: items[0].id,
      title: "Cutoff", content: "Ask staff.", reason: "Sources disagree" })).rejects.toThrow("not open");
    const suggestionId = await suggestAnswerForReviewItem({ actor: staff, clientId: first, reviewItemId: items[0].id,
      title: "Cutoff", content: "Please check with restaurant staff for the current cutoff.",
      reason: "Official and booking listings disagree.", sourceReference: "Official and Chope listings" });
    expect((await listKnowledgeReviewItems(first))[0]).toMatchObject({ status: "suggested", suggestion_id: suggestionId });
    expect((await getPool().query("select status from conversations where id = $1", [conversationId])).rows[0].status).toBe("escalated");
    expect(await retrieveKnowledge(first, deterministicEmbedding("current cutoff"), 5, { queryText: "current cutoff" })).toEqual([]);
    await grant("knowledge.approve", approver);
    await reviewKnowledgeSuggestion({ actor: approver, clientId: first, suggestionId,
      expectedRevision: 1, decision: "approve", note: "Synthetic cautious wording" });
    const draftVersion = await stageApprovedKnowledgeSuggestion({ actor: operator, clientId: first,
      suggestionId, expectedRevision: 1 });
    await markAssistantDraftTested(first, draftVersion);
    await approveConfiguration({ actor: approver, clientId: first, kind: "assistant", targetId: first,
      revision: String(draftVersion), evidence: "Synthetic verified answer" });
    await publishAssistantDraft(first, operator.userId);
    expect((await listKnowledgeReviewItems(first))[0].status).toBe("resolved");
    expect((await getPool().query("select status from conversations where id = $1", [conversationId])).rows[0].status).toBe("escalated");
    await getPool().query("update knowledge_sources set metadata = metadata || '{\"archived\":true}'::jsonb where client_id = $1 and title = 'Reservation source'", [first]);
    const laterMessageId = randomUUID(); const laterEscalationId = randomUUID();
    await getPool().query("insert into messages(id,client_id,channel_id,conversation_id,external_message_id,sender_role,body) values ($1,$2,$3,$4,'later-review','customer','Is the old cutoff still valid?')",
      [laterMessageId, first, channelId, conversationId]);
    await getPool().query("insert into escalations(id,client_id,conversation_id,message_id,reason_code,reason_detail) values ($1,$2,$3,$4,'knowledge_conflict','Review again')",
      [laterEscalationId, first, conversationId, laterMessageId]);
    await enqueueKnowledgeReviewItem(getPool(), { clientId: first, conversationId,
      messageId: laterMessageId, escalationId: laterEscalationId, reasonCode: "knowledge_conflict" });
    expect((await listKnowledgeReviewItems(first)).find((item) => item.message_id === laterMessageId)?.source_references).toEqual([]);
  });

  it("schedules reminders and backup once, invalidates on revision and suppresses resolved handoffs", async () => {
    await grant("escalation.policy.manage", staff);
    await grant("conversation.respond", approver);
    await saveStaffDestination({ actor: operator, clientId: first, kind: "email", destination: approver.email,
      recipientUserId: approver.userId, audience: "business", verified: true, enabled: true,
      verificationEvidence: "Synthetic local mailbox" });
    const destId = (await getPool().query<{ id: string }>("select id from staff_notification_destinations where client_id = $1", [first])).rows[0].id;
    const base = { targetMinutes: 30, timezone: "Asia/Singapore", staffedHours: {},
      initialDestinationId: destId, reminderMinutes: [10, 20], backupDestinationId: destId,
      outOfHoursAcknowledgement: null };
    await saveEscalationPolicy({ actor: staff, clientId: first, expectedVersion: 0, policy: base });
    const channelId = randomUUID(); const conversationId = randomUUID(); const messageId = randomUUID(); const escalationId = randomUUID();
    await getPool().query("insert into channels(id,client_id,kind,name,status) values ($1,$2,'email','Support','draft')", [channelId, first]);
    await getPool().query("insert into conversations(id,client_id,channel_id,external_thread_id,status) values ($1,$2,$3,'reminder-thread','escalated')", [conversationId, first, channelId]);
    await getPool().query("insert into messages(id,client_id,channel_id,conversation_id,external_message_id,sender_role,body) values ($1,$2,$3,$4,'reminder-message','customer','Help')",
      [messageId, first, channelId, conversationId]);
    await getPool().query("insert into escalations(id,client_id,conversation_id,message_id,reason_code,reason_detail) values ($1,$2,$3,$4,'other','Help')",
      [escalationId, first, conversationId, messageId]);
    await enqueueStaffNotification(getPool(), first, escalationId);
    await enqueueStaffNotification(getPool(), first, escalationId);
    expect((await getBusinessAttention(first)).filter((item) => item.escalation_id === escalationId)).toHaveLength(1);
    expect((await getPool().query("select kind,count(*)::int as n from staff_notification_jobs where escalation_id = $1 group by kind order by kind", [escalationId])).rows)
      .toMatchObject([{ kind: "backup", n: 1 }, { kind: "initial", n: 1 }, { kind: "reminder", n: 2 }]);
    await saveEscalationPolicy({ actor: staff, clientId: first, expectedVersion: 1,
      policy: { ...base, reminderMinutes: [15] } });
    expect((await getEscalationPolicy(first))?.version).toBe(2);
    expect((await getPool().query("select count(*)::int as n from staff_notification_jobs where escalation_id = $1 and policy_version = 1 and status = 'cancelled'", [escalationId])).rows[0].n).toBe(3);
    await getPool().query("update escalations set status = 'resolved',resolved_at = now() where id = $1", [escalationId]);
    await getPool().query("update staff_notification_jobs set available_at = now() - interval '1 second' where escalation_id = $1 and kind <> 'initial' and policy_version = 2", [escalationId]);
    await flushStaffNotifications(10, first);
    expect((await getPool().query("select count(*)::int as n from staff_notification_jobs where escalation_id = $1 and kind <> 'initial' and status = 'sent'", [escalationId])).rows[0].n).toBe(0);
    const uncertainId = (await getPool().query<{ id: string }>(
      "select id from staff_notification_jobs where escalation_id = $1 and kind = 'reminder' and policy_version = 2", [escalationId])).rows[0].id;
    await getPool().query("update staff_notification_jobs set status = 'sending', lease_expires_at = now() - interval '1 second' where id = $1", [uncertainId]);
    expect(await markExpiredStaffNotificationsUncertain()).toBeGreaterThanOrEqual(1);
    expect((await getPool().query("select status from staff_notification_jobs where id = $1", [uncertainId])).rows[0].status).toBe("uncertain");
  });

  it("does not invent a response target or timed delivery when none is configured", async () => {
    await grant("escalation.policy.manage", staff);
    await saveEscalationPolicy({ actor: staff, clientId: first, expectedVersion: 0,
      policy: { targetMinutes: null, timezone: "Asia/Singapore", staffedHours: {},
        initialDestinationId: null, reminderMinutes: [], backupDestinationId: null,
        outOfHoursAcknowledgement: null } });
    const channelId = randomUUID(); const conversationId = randomUUID();
    const messageId = randomUUID(); const escalationId = randomUUID();
    await getPool().query("insert into channels(id,client_id,kind,name,status) values ($1,$2,'email','Support','draft')", [channelId, first]);
    await getPool().query("insert into conversations(id,client_id,channel_id,external_thread_id,status) values ($1,$2,$3,'no-target','escalated')", [conversationId, first, channelId]);
    await getPool().query("insert into messages(id,client_id,channel_id,conversation_id,external_message_id,sender_role,body) values ($1,$2,$3,$4,'no-target-message','customer','Help')",
      [messageId, first, channelId, conversationId]);
    await getPool().query("insert into escalations(id,client_id,conversation_id,message_id,reason_code,reason_detail) values ($1,$2,$3,$4,'other','Help')",
      [escalationId, first, conversationId, messageId]);
    await enqueueStaffNotification(getPool(), first, escalationId);
    expect((await getPool().query("select kind from staff_notification_jobs where escalation_id = $1", [escalationId])).rows)
      .toEqual([{ kind: "initial" }]);
  });
});
