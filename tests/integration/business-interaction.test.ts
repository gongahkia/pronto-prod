import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { createKnowledgeSuggestion, listKnowledgeSuggestions, reviewKnowledgeSuggestion,
  reviseKnowledgeSuggestion, stageApprovedKnowledgeSuggestion } from "@/lib/knowledge/suggestions";
import { publishAssistantDraft } from "@/lib/assistant-drafts";
import { approveConfiguration } from "@/lib/managed-approvals";
import { getEscalationPolicy, saveEscalationPolicy } from "@/lib/staff-configuration";
import { hasStaffCapability, setStaffCapability } from "@/lib/staff-permissions";
import { confirmStaffCommand, parseStaffCommand, proposeStaffCommand, viewStaffPolicy } from "@/lib/staff-interaction";
import { deliveryLabel, getBusinessActivity, getBusinessAttention } from "@/lib/business-portal";
import { retrieveKnowledge } from "@/lib/knowledge/retrieve";
import { deterministicEmbedding } from "@/lib/llm/mock";

const dbDescribe = process.env.PRONTO_RUN_DB_TESTS === "1" ? describe : describe.skip;
dbDescribe("business portal suggestions and local staff interaction", () => {
  let first: string; let second: string; let operator: SessionUser;
  let approver: SessionUser; let manager: SessionUser; let responder: SessionUser; let outsider: SessionUser;
  beforeEach(async () => {
    vi.stubEnv("PRONTO_USE_MOCK_AI", "1");
    vi.stubEnv("PRONTO_LOCAL_STAFF_COMMANDS", "1");
    [first, second] = [randomUUID(), randomUUID()];
    for (const id of [first, second]) {
      await getPool().query("insert into clients (id, name, slug, vertical, brand_voice) values ($1, 'Business test', $2, 'test', 'Clear')",
        [id, `business-${id}`]);
      await getPool().query("insert into agent_configs (client_id, prompt_preamble) values ($1, 'Use approved facts')", [id]);
    }
    const user = async (clientId: string | null, role: "operator" | "client", name: string): Promise<SessionUser> => {
      const id = randomUUID(); const email = `staff-${id}@example.test`;
      await getPool().query("insert into users (id, client_id, email, name, role, password_hash) values ($1, $2, $3, $4, $5, 'unused')",
        [id, clientId, email, name, role]);
      return { userId: id, clientId, role, email, name };
    };
    operator = await user(null, "operator", "Pronto operator");
    approver = await user(first, "client", "Knowledge approver");
    manager = await user(first, "client", "Policy manager");
    responder = await user(first, "client", "Responder");
    outsider = await user(second, "client", "Other business");
  });
  afterEach(async () => {
    await getPool().query("delete from clients where id = any($1::uuid[])", [[first, second]]);
    await getPool().query("delete from users where id = $1", [operator.userId]);
    vi.unstubAllEnvs();
  });
  afterAll(async () => { await getPool().end(); });

  it("keeps a correction pending, reviews the exact revision, and requires tested operator publication", async () => {
    const suggestionId = await createKnowledgeSuggestion({ actor: responder, clientId: first,
      title: "Weekend policy", content: "Ask the concierge about weekend reservations.",
      reason: "The public sources disagree about the cutoff.", sourceReference: "Two public sources",
      requestKey: "demo-correction" });
    expect(await createKnowledgeSuggestion({ actor: responder, clientId: first,
      title: "Weekend policy", content: "Ask the concierge about weekend reservations.",
      reason: "The public sources disagree about the cutoff.", sourceReference: "Two public sources",
      requestKey: "demo-correction" })).toBe(suggestionId);
    await expect(createKnowledgeSuggestion({ actor: responder, clientId: first,
      title: "Weekend policy", content: "Different answer", reason: "Different request",
      requestKey: "demo-correction" })).rejects.toThrow("already used");
    expect((await getPool().query("select count(*)::int as n from knowledge_sources where client_id = $1", [first])).rows[0].n).toBe(0);
    expect(await retrieveKnowledge(first, deterministicEmbedding("Weekend policy"), 5,
      { queryText: "weekend reservations" })).toEqual([]);
    await expect(reviewKnowledgeSuggestion({ actor: responder, clientId: first, suggestionId,
      expectedRevision: 1, decision: "approve", note: "I approve" })).rejects.toThrow("knowledge.approve");
    await setStaffCapability({ actor: operator, clientId: first, userId: approver.userId,
      capability: "knowledge.approve", granted: true, evidence: "Synthetic delegation" });
    await reviewKnowledgeSuggestion({ actor: approver, clientId: first, suggestionId,
      expectedRevision: 1, decision: "request_revision", note: "Clarify that this remains uncertain" });
    const revision = await reviseKnowledgeSuggestion({ actor: responder, clientId: first, suggestionId,
      expectedRevision: 1, title: "Weekend policy", content: "Weekend cutoff is under review; ask the concierge.",
      reason: "Official and Chope sources disagree.", sourceReference: "Official page; Chope listing" });
    expect(revision).toBe(2);
    await expect(reviewKnowledgeSuggestion({ actor: approver, clientId: first, suggestionId,
      expectedRevision: 1, decision: "approve", note: "Stale" })).rejects.toThrow("changed");
    await reviewKnowledgeSuggestion({ actor: approver, clientId: first, suggestionId,
      expectedRevision: 2, decision: "approve", note: "Reviewed exact wording" });
    expect((await getPool().query("select count(*)::int as n from knowledge_sources where client_id = $1", [first])).rows[0].n).toBe(0);
    const draftVersion = await stageApprovedKnowledgeSuggestion({ actor: operator, clientId: first,
      suggestionId, expectedRevision: 2 });
    await expect(publishAssistantDraft(first, operator.userId)).rejects.toThrow("business approval");
    await approveConfiguration({ actor: approver, clientId: first, kind: "assistant", targetId: first,
      revision: String(draftVersion), evidence: "Reviewed tested assistant revision" });
    await expect(publishAssistantDraft(first, responder.userId)).rejects.toThrow("Pronto operator");
    await publishAssistantDraft(first, operator.userId);
    const source = (await getPool().query<{ id: string; content: string }>(
      "select id, content from knowledge_sources where client_id = $1", [first])).rows[0];
    expect(source.content).toContain("under review");
    expect((await retrieveKnowledge(first, deterministicEmbedding("Weekend policy"), 5,
      { queryText: "weekend cutoff" })).some((chunk) => chunk.content.includes("under review"))).toBe(true);
    expect((await getPool().query("select actor_user_id from knowledge_source_versions where source_id = $1",
      [source.id])).rows[0].actor_user_id).toBe(responder.userId);
    expect((await listKnowledgeSuggestions(first))[0]).toMatchObject({ status: "published", reviewed_by: approver.userId });
    expect((await getPool().query("select count(*)::int as n from audit_logs where client_id = $1 and action like 'knowledge_suggestion.%'",
      [first])).rows[0].n).toBeGreaterThanOrEqual(4);
  });

  it("rejects cross-tenant, stale, unauthorized and post-approval edits", async () => {
    const id = await createKnowledgeSuggestion({ actor: responder, clientId: first,
      title: "Hours", content: "Close at 10pm", reason: "Clarify hours" });
    await expect(createKnowledgeSuggestion({ actor: outsider, clientId: first,
      title: "Wrong tenant", content: "Wrong", reason: "Wrong" })).rejects.toThrow("signed-in member");
    await setStaffCapability({ actor: operator, clientId: second, userId: outsider.userId,
      capability: "knowledge.approve", granted: true, evidence: "Other business delegation" });
    await expect(reviewKnowledgeSuggestion({ actor: outsider, clientId: second, suggestionId: id,
      expectedRevision: 1, decision: "reject", note: "Wrong" })).rejects.toThrow("not found");
    await setStaffCapability({ actor: operator, clientId: first, userId: approver.userId,
      capability: "knowledge.approve", granted: true, evidence: "Synthetic delegation" });
    await reviewKnowledgeSuggestion({ actor: approver, clientId: first, suggestionId: id,
      expectedRevision: 1, decision: "reject", note: "Source not verified" });
    expect((await listKnowledgeSuggestions(first))[0].status).toBe("rejected");
    await reviseKnowledgeSuggestion({ actor: responder, clientId: first, suggestionId: id,
      expectedRevision: 1, title: "Hours", content: "Confirm hours by phone", reason: "Source not verified" });
    await reviewKnowledgeSuggestion({ actor: approver, clientId: first, suggestionId: id,
      expectedRevision: 2, decision: "approve", note: "Approved cautious answer" });
    await expect(reviseKnowledgeSuggestion({ actor: responder, clientId: first, suggestionId: id,
      expectedRevision: 2, title: "Hours", content: "Changed after approval", reason: "Attempt" }))
      .rejects.toThrow("Approved or published");
  });

  it("requires a present business reviewer before an approved correction can be staged", async () => {
    await setStaffCapability({ actor: operator, clientId: first, userId: approver.userId,
      capability: "knowledge.approve", granted: true, evidence: "Synthetic delegation" });
    const suggestionId = await createKnowledgeSuggestion({ actor: responder, clientId: first,
      title: "Former reviewer policy", content: "Ask staff for current details.", reason: "Review required" });
    await reviewKnowledgeSuggestion({ actor: approver, clientId: first, suggestionId,
      expectedRevision: 1, decision: "approve", note: "Synthetic approval" });
    await getPool().query("delete from users where id = $1 and client_id = $2", [approver.userId, first]);
    await expect(stageApprovedKnowledgeSuggestion({ actor: operator, clientId: first,
      suggestionId, expectedRevision: 1 })).rejects.toThrow("business approval");
  });

  it("requires a distinct policy capability, explicit confirmation, and rejects replay or wrong tenant", async () => {
    expect(await hasStaffCapability(responder, first, "escalation.policy.manage")).toBe(false);
    await expect(proposeStaffCommand({ actor: responder, requestKey: "reply-target", text:
      "Change our escalation response target to 30 minutes" })).rejects.toThrow("escalation.policy.manage");
    await setStaffCapability({ actor: operator, clientId: first, userId: manager.userId,
      capability: "escalation.policy.manage", granted: true, evidence: "Synthetic delegation" });
    const proposed = await proposeStaffCommand({ actor: manager, requestKey: "reply-target", text:
      "Change our escalation response target to 30 minutes" });
    expect(proposed).toMatchObject({ state: "pending", oldValue: null, newValue: 30 });
    expect(await getEscalationPolicy(first)).toBeNull();
    expect((await proposeStaffCommand({ actor: manager, requestKey: "reply-target", text:
      "Change our escalation response target to 30 minutes" })).confirmationToken).toBeNull();
    await expect(confirmStaffCommand({ actor: outsider, requestId: proposed.id,
      confirmationToken: proposed.confirmationToken! })).rejects.toThrow("Invalid confirmation");
    await expect(confirmStaffCommand({ actor: manager, requestId: proposed.id,
      confirmationToken: "forged" })).rejects.toThrow("Invalid confirmation");
    expect(await confirmStaffCommand({ actor: manager, requestId: proposed.id,
      confirmationToken: proposed.confirmationToken! })).toMatchObject({ state: "applied", policyVersion: 1 });
    expect((await getEscalationPolicy(first))?.policy.targetMinutes).toBe(30);
    expect((await confirmStaffCommand({ actor: manager, requestId: proposed.id,
      confirmationToken: proposed.confirmationToken! })).state).toBe("already_applied");
    expect((await getPool().query("select count(*)::int as n from escalation_policy_versions where client_id = $1",
      [first])).rows[0].n).toBe(1);
    expect((await viewStaffPolicy(manager)).policy?.targetMinutes).toBe(30);
  });

  it("rejects expired, stale and revoked policy confirmations", async () => {
    await setStaffCapability({ actor: operator, clientId: first, userId: manager.userId,
      capability: "escalation.policy.manage", granted: true, evidence: "Synthetic delegation" });
    const expired = await proposeStaffCommand({ actor: manager, requestKey: "expired", text:
      "Change our escalation response target to 20 minutes" });
    await getPool().query("update staff_command_requests set expires_at = now() - interval '1 second' where id = $1", [expired.id]);
    await expect(confirmStaffCommand({ actor: manager, requestId: expired.id,
      confirmationToken: expired.confirmationToken! })).rejects.toThrow("expired");
    const stale = await proposeStaffCommand({ actor: manager, requestKey: "stale", text:
      "Change our escalation response target to 25 minutes" });
    const defaultPolicy = { targetMinutes: 60, timezone: "Asia/Singapore", staffedHours: {},
      initialDestinationId: null, reminderMinutes: [], backupDestinationId: null,
      outOfHoursAcknowledgement: null };
    await saveEscalationPolicy({ actor: manager, clientId: first, expectedVersion: 0, policy: defaultPolicy });
    await expect(confirmStaffCommand({ actor: manager, requestId: stale.id,
      confirmationToken: stale.confirmationToken! })).rejects.toThrow("changed");
    const revoked = await proposeStaffCommand({ actor: manager, requestKey: "revoked", text:
      "Change our escalation response target to 40 minutes" });
    await setStaffCapability({ actor: operator, clientId: first, userId: manager.userId,
      capability: "escalation.policy.manage", granted: false, evidence: "Synthetic revocation" });
    await expect(confirmStaffCommand({ actor: manager, requestId: revoked.id,
      confirmationToken: revoked.confirmationToken! })).rejects.toThrow("escalation.policy.manage");
    expect((await getEscalationPolicy(first))?.policy.targetMinutes).toBe(60);
  });

  it("prevents a business permission manager from granting themselves another capability", async () => {
    await setStaffCapability({ actor: operator, clientId: first, userId: manager.userId,
      capability: "staff.permissions.manage", granted: true, evidence: "Synthetic delegation" });
    await expect(setStaffCapability({ actor: manager, clientId: first, userId: manager.userId,
      capability: "channel.activate", granted: true, evidence: "Self request" }))
      .rejects.toThrow("own permissions");
    expect(await hasStaffCapability(manager, first, "channel.activate")).toBe(false);
  });

  it("submits knowledge via local chat as pending and rejects privileged chat commands", async () => {
    expect(parseStaffCommand("Show escalation policy")).toBe("view_policy");
    expect(() => parseStaffCommand("Activate our WhatsApp channel")).toThrow("Supported local requests");
    const proposed = await proposeStaffCommand({ actor: responder, requestKey: "fact-1", text:
      "Suggest knowledge: Dietary options | Ask staff to check ingredients | Avoid unsupported claims | Menu" });
    expect((await listKnowledgeSuggestions(first))).toEqual([]);
    const confirmed = await confirmStaffCommand({ actor: responder, requestId: proposed.id,
      confirmationToken: proposed.confirmationToken! });
    expect(confirmed.resultReference).toBeTruthy();
    expect((await listKnowledgeSuggestions(first))[0].status).toBe("pending");
    expect((await getPool().query("select count(*)::int as n from knowledge_sources where client_id = $1", [first])).rows[0].n).toBe(0);
    expect((await confirmStaffCommand({ actor: responder, requestId: proposed.id,
      confirmationToken: proposed.confirmationToken! })).state).toBe("already_applied");
  });

  it("shows only tenant attention and honest delivery labels", async () => {
    const channelId = randomUUID(); const conversationId = randomUUID(); const messageId = randomUUID();
    await getPool().query("insert into channels (id, client_id, kind, name) values ($1, $2, 'email', 'Support')", [channelId, first]);
    await getPool().query("insert into conversations (id, client_id, channel_id, external_thread_id, status) values ($1, $2, $3, 'thread', 'escalated')",
      [conversationId, first, channelId]);
    await getPool().query("insert into messages (id, client_id, channel_id, conversation_id, external_message_id, sender_role, body) values ($1, $2, $3, $4, 'first', 'customer', 'Help')",
      [messageId, first, channelId, conversationId]);
    await getPool().query("insert into escalations (client_id, conversation_id, message_id, reason_code, reason_detail) values ($1, $2, $3, 'other', 'Help')",
      [first, conversationId, messageId]);
    expect((await getBusinessAttention(first)).map((item) => item.conversation_id)).toEqual([conversationId]);
    expect(await getBusinessAttention(second)).toEqual([]);
    expect((await getBusinessActivity(first)).map((item) => item.conversation_id)).toEqual([conversationId]);
    expect(deliveryLabel("sent", null, false)).toContain("delivery unverified");
    expect(deliveryLabel("sent", "delivered", false)).toContain("Delivered");
    expect(deliveryLabel("sent", "delivered", true)).toContain("Simulated");
    expect(deliveryLabel("failed", null, true)).toContain("Failed");
    expect(deliveryLabel("uncertain", null, false)).toContain("Uncertain");
  });
});
