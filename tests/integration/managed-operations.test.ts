import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { getAssistantDraft, markAssistantDraftTested, publishAssistantDraft, stageVoice } from "@/lib/assistant-drafts";
import { approveConfiguration } from "@/lib/managed-approvals";
import { changeOnboardingStage, listOnboardingStages } from "@/lib/onboarding";
import { getEscalationPolicy, saveEscalationPolicy, saveStaffDestination } from "@/lib/staff-configuration";
import { enqueueStaffNotification } from "@/lib/staff-notifications";
import { hasStaffCapability, setStaffCapability } from "@/lib/staff-permissions";

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
    const channelId = randomUUID();
    await getPool().query("insert into channels (id, client_id, kind, name, status, settings) values ($1, $2, 'email', 'Support', 'draft', $3)",
      [channelId, first, { supportAddress: "support@example.test" }]);
    const before = (await getPool().query("select settings from channels where id = $1", [channelId])).rows[0].settings;
    await saveStaffDestination({ actor: activator, clientId: first, kind: "email", destination: "staff@example.test",
      audience: "business", verified: false, enabled: false });
    expect((await getPool().query("select settings from channels where id = $1", [channelId])).rows[0].settings).toEqual(before);
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

  it("deduplicates durable staff notification jobs for one escalation", async () => {
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
  });
});
