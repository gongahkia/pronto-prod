import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { getAssistantDraft, markAssistantDraftTested, publishAssistantDraft, stageAgentConfig, stageVoice } from "@/lib/assistant-drafts";
import { approveConfiguration, channelEvidenceKinds, recordChannelActivationEvidence } from "@/lib/managed-approvals";
import { activateCustomerChannel } from "@/lib/channel-activation";
import { changeOnboardingStage, listOnboardingStages } from "@/lib/onboarding";
import { getEscalationPolicy, saveEscalationPolicy, saveStaffDestination } from "@/lib/staff-configuration";
import { enqueueStaffNotification, flushStaffNotifications, retryStaffNotification } from "@/lib/staff-notifications";
import { hasStaffCapability, setStaffCapability } from "@/lib/staff-permissions";
import { canViewBusinessConversation } from "@/lib/staff-permissions";
import { getFilteredConversations } from "@/lib/reporting";

const dbDescribe = process.env.PRONTO_RUN_DB_TESTS === "1" ? describe : describe.skip;
dbDescribe("managed operations and tenant authority", () => {
  let first: string; let second: string; let approverId: string; let activatorId: string; let otherId: string;
  let operatorId: string; let operator: SessionUser; let approver: SessionUser; let activator: SessionUser;
  beforeEach(async () => {
    [first, second, approverId, activatorId, otherId, operatorId] = Array.from({ length: 6 }, () => randomUUID());
    vi.stubEnv("PRONTO_USE_MOCK_AI", "1");
    for (const id of [first, second]) {
      await getPool().query("insert into clients (id, name, slug, vertical, brand_voice) values ($1, 'Managed test', $2, 'test', 'Original voice')",
        [id, `managed-${id}`]);
      await getPool().query("insert into agent_configs (client_id, prompt_preamble) values ($1, 'Answer from knowledge')", [id]);
      await getPool().query(
        "insert into onboarding_stages (client_id, stage) select $1, unnest(array['profile','communications','knowledge','testing','activation'])",
        [id]);
    }
    for (const [id, clientId] of [[approverId, first], [activatorId, first], [otherId, second]]) {
      await getPool().query("insert into users (id, client_id, email, name, role, password_hash) values ($1, $2, $3, 'Staff', 'client', 'unused')",
        [id, clientId, `managed-${id}@example.test`]);
    }
    await getPool().query("insert into users (id, email, name, role, password_hash) values ($1, $2, 'Operator', 'operator', 'unused')",
      [operatorId, `managed-${operatorId}@example.test`]);
    operator = { userId: operatorId, clientId: null, role: "operator", email: "operator@example.test", name: "Operator" };
    approver = { userId: approverId, clientId: first, role: "client", email: "approver@example.test", name: "Approver" };
    activator = { userId: activatorId, clientId: first, role: "client", email: "activator@example.test", name: "Activator" };
  });
  afterEach(async () => {
    await getPool().query("delete from clients where id = any($1::uuid[])", [[first, second]]);
    await getPool().query("delete from users where id = $1", [operatorId]);
    vi.unstubAllEnvs();
  });
  afterAll(async () => { await getPool().end(); });

  it("does not grant generic clients approval, activation, response or permission management", async () => {
    for (const capability of ["knowledge.approve", "channel.activate", "conversation.respond", "staff.permissions.manage"] as const)
      expect(await hasStaffCapability(approver, first, capability)).toBe(false);
    await setStaffCapability({ actor: operator, clientId: first, userId: approverId,
      capability: "knowledge.approve", granted: true, evidence: "Written business delegation" });
    await setStaffCapability({ actor: operator, clientId: first, userId: activatorId,
      capability: "channel.activate", granted: true, evidence: "Written business delegation" });
    expect(await hasStaffCapability(approver, first, "knowledge.approve")).toBe(true);
    expect(await hasStaffCapability(approver, first, "channel.activate")).toBe(false);
    expect(await hasStaffCapability(activator, first, "knowledge.approve")).toBe(false);
    expect(await hasStaffCapability(activator, first, "channel.activate")).toBe(true);
    expect(await hasStaffCapability(approver, second, "knowledge.approve")).toBe(false);
    expect(await canViewBusinessConversation(approver, first)).toBe(false);
    await setStaffCapability({ actor: operator, clientId: first, userId: activatorId,
      capability: "conversation.respond", granted: true, evidence: "Handoff delegation" });
    expect(await canViewBusinessConversation(activator, first)).toBe(true);
    expect(await canViewBusinessConversation(activator, second)).toBe(false);
    await expect(setStaffCapability({ actor: approver, clientId: second, userId: otherId,
      capability: "channel.activate", granted: true, evidence: "Unauthorized" })).rejects.toThrow();
  });

  it("binds knowledge approval to the current tested revision and requires Pronto publication", async () => {
    await setStaffCapability({ actor: operator, clientId: first, userId: approverId,
      capability: "knowledge.approve", granted: true, evidence: "Owner delegation" });
    await stageVoice({ clientId: first, actorUserId: operatorId,
      voice: { title: "Guide", content: "Reply warmly.", examples: [] } });
    const original = (await getAssistantDraft(first))!.edit_version;
    await approveConfiguration({ actor: approver, clientId: first, kind: "assistant", targetId: first,
      revision: String(original), evidence: "Reviewed guide" });
    await stageVoice({ clientId: first, actorUserId: operatorId,
      voice: { title: "Guide", content: "Reply clearly.", examples: [] } });
    const current = (await getAssistantDraft(first))!.edit_version;
    await expect(approveConfiguration({ actor: approver, clientId: first, kind: "assistant", targetId: first,
      revision: String(original), evidence: "Stale" })).rejects.toThrow("changed");
    await markAssistantDraftTested(first, current);
    await expect(publishAssistantDraft(first, operatorId)).rejects.toThrow("business approval");
    await expect(approveConfiguration({ actor: activator, clientId: first, kind: "assistant", targetId: first,
      revision: String(current), evidence: "Wrong capability" })).rejects.toThrow("knowledge.approve");
    await approveConfiguration({ actor: approver, clientId: first, kind: "assistant", targetId: first,
      revision: String(current), evidence: "Reviewed latest guide" });
    expect(await publishAssistantDraft(first, operatorId)).toBe(1);
    expect((await getPool().query("select brand_voice from clients where id = $1", [first])).rows[0].brand_voice)
      .toBe("Reply clearly.");
  });

  it("stages prompt and assistant-rule edits before they can affect live customer answers", async () => {
    await setStaffCapability({ actor: operator, clientId: first, userId: approverId,
      capability: "knowledge.approve", granted: true, evidence: "Owner delegation" });
    await stageAgentConfig({ clientId: first, actorUserId: operatorId,
      responseProvider: "mock", responseModel: "mock", embeddingProvider: "mock", embeddingModel: "mock",
      retrievalThreshold: 0.6, promptPreamble: "Use the reviewed knowledge only.",
      escalationRules: { humanRequested: true }, changeReason: "Reviewed pilot tuning" });
    expect((await getPool().query("select prompt_preamble from agent_configs where client_id = $1", [first]))
      .rows[0].prompt_preamble).toBe("Answer from knowledge");
    const revision = (await getAssistantDraft(first))!.edit_version;
    await markAssistantDraftTested(first, revision);
    await approveConfiguration({ actor: approver, clientId: first, kind: "assistant", targetId: first,
      revision: String(revision), evidence: "Reviewed prompt and rules" });
    await publishAssistantDraft(first, operatorId);
    expect((await getPool().query("select prompt_preamble from agent_configs where client_id = $1", [first]))
      .rows[0].prompt_preamble).toBe("Use the reviewed knowledge only.");
  });

  it("does not activate a customer channel from health alone or a knowledge-only approver", async () => {
    await setStaffCapability({ actor: operator, clientId: first, userId: approverId,
      capability: "knowledge.approve", granted: true, evidence: "Owner delegation" });
    await setStaffCapability({ actor: operator, clientId: first, userId: activatorId,
      capability: "channel.activate", granted: true, evidence: "Owner delegation" });
    const channelId = randomUUID();
    await getPool().query(
      `insert into channels (id, client_id, kind, name, status, last_health_status, last_health_check_at)
       values ($1, $2, 'whatsapp', 'Test', 'draft', 'healthy', now())`, [channelId, first]);
    const revision = new Date((await getPool().query<{ updated_at: Date }>(
      "select updated_at from channels where id = $1", [channelId])).rows[0].updated_at).toISOString();
    await expect(activateCustomerChannel({ actor: operator, clientId: first, channelId, revision }))
      .rejects.toThrow("business approval");
    await expect(approveConfiguration({ actor: approver, clientId: first, kind: "channel",
      targetId: channelId, revision, evidence: "Wrong authority" })).rejects.toThrow("channel.activate");
    await approveConfiguration({ actor: activator, clientId: first, kind: "channel",
      targetId: channelId, revision, evidence: "Business approved this number" });
    await expect(activateCustomerChannel({ actor: operator, clientId: first, channelId, revision }))
      .rejects.toThrow("evidence missing");
    for (const checkKind of channelEvidenceKinds)
      await recordChannelActivationEvidence({ actor: operator, clientId: first, channelId,
        revision, checkKind, details: "Controlled test record" });
    await expect(activateCustomerChannel({ actor: operator, clientId: first, channelId, revision }))
      .rejects.toThrow("Onboarding approval missing");
    expect((await getPool().query("select status from channels where id = $1", [channelId])).rows[0].status)
      .toBe("draft");
    await getPool().query(
      "update onboarding_stages set state = 'approved', approved_by = $2, approved_at = now() where client_id = $1 and stage in ('profile','communications','knowledge','testing')",
      [first, activatorId]);
    await activateCustomerChannel({ actor: operator, clientId: first, channelId, revision });
    expect((await getPool().query("select status from channels where id = $1", [channelId])).rows[0].status)
      .toBe("active");
  });

  it("persists five resumable stages and refuses invalid, stale and unauthorized transitions", async () => {
    await setStaffCapability({ actor: operator, clientId: first, userId: approverId,
      capability: "knowledge.approve", granted: true, evidence: "Owner delegation" });
    await setStaffCapability({ actor: operator, clientId: first, userId: activatorId,
      capability: "channel.activate", granted: true, evidence: "Owner delegation" });
    const stages = await listOnboardingStages(first);
    expect(stages).toHaveLength(5);
    expect(stages.every((stage) => stage.state === "draft")).toBe(true);
    await expect(changeOnboardingStage({ actor: operator, clientId: first, stage: "profile", action: "submit",
      expectedRevision: 1 })).rejects.toThrow("required fields");
    const saved = await changeOnboardingStage({ actor: operator, clientId: first, stage: "profile", action: "save",
      expectedRevision: 1, details: { businessName: "Managed test", timezone: "Asia/Singapore", serviceScope: "FAQ" },
      evidence: { sourceReview: "Owner email" } });
    expect(saved.revision).toBe(2);
    const submitted = await changeOnboardingStage({ actor: operator, clientId: first, stage: "profile", action: "submit",
      expectedRevision: 2 });
    await expect(changeOnboardingStage({ actor: activator, clientId: first, stage: "profile", action: "approve",
      expectedRevision: submitted.revision })).rejects.toThrow("knowledge.approve");
    const approved = await changeOnboardingStage({ actor: approver, clientId: first, stage: "profile", action: "approve",
      expectedRevision: submitted.revision });
    expect(approved.approved_by).toBe(approverId);
    await expect(changeOnboardingStage({ actor: approver, clientId: first, stage: "profile", action: "approve",
      expectedRevision: 1 })).rejects.toThrow("changed");
    expect((await listOnboardingStages(first))[0].state).toBe("approved");
  });

  it("versions response targets without inventing an SLA and isolates staff contacts from customer channels", async () => {
    await setStaffCapability({ actor: operator, clientId: first, userId: activatorId,
      capability: "staff.permissions.manage", granted: true, evidence: "Owner delegation" });
    await expect(saveEscalationPolicy({ actor: activator, clientId: first, expectedVersion: 0,
      policy: { targetMinutes: null, timezone: "Asia/Singapore", staffedHours: {}, initialDestinationId: null,
        reminderMinutes: [], backupDestinationId: null, outOfHoursAcknowledgement: null } }))
      .rejects.toThrow("escalation.policy.manage");
    await setStaffCapability({ actor: operator, clientId: first, userId: activatorId,
      capability: "escalation.policy.manage", granted: true, evidence: "Policy delegation" });
    const channelId = randomUUID();
    await getPool().query("insert into channels (id, client_id, kind, name, status, settings) values ($1, $2, 'email', 'Support', 'draft', $3)",
      [channelId, first, { supportAddress: "support@example.test" }]);
    const before = (await getPool().query("select settings from channels where id = $1", [channelId])).rows[0].settings;
    await saveStaffDestination({ actor: activator, clientId: first, kind: "email", destination: "staff@example.test",
      audience: "business", verified: false, enabled: false });
    expect((await getPool().query("select settings from channels where id = $1", [channelId])).rows[0].settings).toEqual(before);
    await expect(saveStaffDestination({ actor: operator, clientId: first, kind: "email",
      destination: "wrong@example.test", audience: "business", recipientUserId: otherId,
      verified: true, enabled: true, verificationEvidence: "Controlled identity check" })).rejects.toThrow("audience");
    await expect(saveStaffDestination({ actor: operator, clientId: first, kind: "email",
      destination: "approver@example.test", audience: "business", recipientUserId: approverId,
      verified: true, enabled: true, verificationEvidence: "Controlled identity check" })).rejects.toThrow("conversation access");
    await setStaffCapability({ actor: operator, clientId: first, userId: approverId,
      capability: "conversation.respond", granted: true, evidence: "Handoff delegation" });
    await saveStaffDestination({ actor: operator, clientId: first, kind: "email",
      destination: "approver@example.test", audience: "business", recipientUserId: approverId,
      verified: true, enabled: true, verificationEvidence: "Controlled identity check" });
    expect((await getPool().query("select enabled from staff_notification_destinations where client_id = $1 and destination = $2",
      [first, "approver@example.test"])).rows[0].enabled).toBe(true);
    const policy = { targetMinutes: null, timezone: "Asia/Singapore", staffedHours: {},
      initialDestinationId: null, reminderMinutes: [], backupDestinationId: null,
      outOfHoursAcknowledgement: null };
    expect(await getEscalationPolicy(first)).toBeNull();
    expect(await saveEscalationPolicy({ actor: activator, clientId: first, expectedVersion: 0, policy })).toBe(1);
    expect((await getEscalationPolicy(first))?.policy.targetMinutes).toBeNull();
    expect(await saveEscalationPolicy({ actor: activator, clientId: first, expectedVersion: 1,
      policy: { ...policy, targetMinutes: 120 } })).toBe(2);
    await expect(saveEscalationPolicy({ actor: activator, clientId: first, expectedVersion: 1,
      policy: { ...policy, targetMinutes: 30 } })).rejects.toThrow("changed");
    expect((await getEscalationPolicy(first))?.policy.targetMinutes).toBe(120);
  });

  it("deduplicates durable staff notifications and requires reconciled manual retry", async () => {
    const channelId = randomUUID(); const conversationId = randomUUID(); const messageId = randomUUID();
    const escalationId = randomUUID();
    await getPool().query("insert into channels (id, client_id, kind, name, status) values ($1, $2, 'email', 'Support', 'draft')",
      [channelId, first]);
    await getPool().query("insert into conversations (id, client_id, channel_id, external_thread_id, customer_handle) values ($1, $2, $3, 'thread', 'test@example.test')",
      [conversationId, first, channelId]);
    await getPool().query("insert into messages (id, client_id, channel_id, conversation_id, external_message_id, sender_role, body) values ($1, $2, $3, $4, 'managed-help', 'customer', 'Help')",
      [messageId, first, channelId, conversationId]);
    await getPool().query("insert into escalations (id, client_id, conversation_id, message_id, reason_code, reason_detail, confidence) values ($1, $2, $3, $4, 'other', 'Help', 1)",
      [escalationId, first, conversationId, messageId]);
    await enqueueStaffNotification(getPool(), first, escalationId);
    await enqueueStaffNotification(getPool(), first, escalationId);
    expect((await getPool().query("select count(*)::int as count from staff_notification_jobs where escalation_id = $1",
      [escalationId])).rows[0].count).toBe(1);
    expect(await flushStaffNotifications(25, first)).toMatchObject({ attempted: 1, sent: 0, failed: 1 });
    const job = (await getPool().query<{ id: string; status: string }>(
      "select id, status from staff_notification_jobs where escalation_id = $1", [escalationId])).rows[0];
    expect(job.status).toBe("dead");
    await expect(retryStaffNotification({ clientId: first, jobId: job.id, actorUserId: operatorId,
      reconciliation: "" })).rejects.toThrow("reconciliation");
    await retryStaffNotification({ clientId: first, jobId: job.id, actorUserId: operatorId,
      reconciliation: "Confirmed no notification delivered" });
    expect((await getPool().query("select status from staff_notification_jobs where id = $1", [job.id])).rows[0].status)
      .toBe("pending");
    expect((await getPool().query("select count(*)::int as count from staff_notification_jobs where escalation_id = $1",
      [escalationId])).rows[0].count).toBe(1);
  });

  it("filters the real cross-business inbox while preserving tenant-scoped reads", async () => {
    const channelA = randomUUID(); const channelB = randomUUID();
    const conversationA = randomUUID(); const conversationB = randomUUID();
    await getPool().query("update clients set name = case when id = $1 then 'Alpha Managed' else 'Beta Managed' end where id = any($2::uuid[])",
      [first, [first, second]]);
    for (const [channelId, clientId, kind, conversationId, handle] of [
      [channelA, first, "email", conversationA, "alpha@example.test"],
      [channelB, second, "whatsapp", conversationB, "beta@example.test"],
    ]) {
      await getPool().query("insert into channels (id, client_id, kind, name, status) values ($1, $2, $3::channel_kind, 'Support', 'draft')",
        [channelId, clientId, kind]);
      await getPool().query("insert into conversations (id, client_id, channel_id, external_thread_id, customer_handle) values ($1, $2, $3, $4, $5)",
        [conversationId, clientId, channelId, `${handle}-thread`, handle]);
    }
    expect((await getFilteredConversations({ businessSearch: "Alpha", query: "alpha@example.test", channelKind: "email" }))
      .map((row) => row.id)).toEqual([conversationA]);
    expect(await getFilteredConversations({ clientId: first, query: "beta@example.test" })).toEqual([]);
    expect(await getFilteredConversations({ assignedSearch: "Nobody" })).toEqual([]);
  });
});
