import { recordAuditLog } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth";
import { query, transaction, type Queryable } from "@/lib/db";
import { requireStaffCapability } from "@/lib/staff-permissions";

type ApprovalKind = "assistant" | "channel";
type RevisionRow = { revision: string };

export async function currentConfigurationRevision(
  db: Queryable, clientId: string, kind: ApprovalKind, targetId: string,
): Promise<string | null> {
  if (kind === "assistant") {
    const result = await db.query<{ edit_version: number }>(
      "select edit_version from assistant_drafts where client_id = $1 for update", [clientId]);
    return result.rows[0] ? String(result.rows[0].edit_version) : null;
  }
  const draft = await db.query<{ updated_at: Date }>(
    "select updated_at from channel_drafts where client_id = $1 and channel_id = $2 for update",
    [clientId, targetId]);
  if (draft.rows[0]) return new Date(draft.rows[0].updated_at).toISOString();
  const live = await db.query<{ updated_at: Date }>(
    "select updated_at from channels where client_id = $1 and id = $2 for update",
    [clientId, targetId]);
  return live.rows[0] ? new Date(live.rows[0].updated_at).toISOString() : null;
}

export async function approveConfiguration(input: {
  actor: SessionUser; clientId: string; kind: ApprovalKind;
  targetId: string; revision: string; evidence: string;
}): Promise<void> {
  if (input.actor.role !== "client" || input.actor.clientId !== input.clientId)
    throw new Error("Business approval requires an authorized member of this business.");
  if (!input.evidence.trim()) throw new Error("Approval evidence is required.");
  await transaction(async (db) => {
    await requireStaffCapability(input.actor, input.clientId,
      input.kind === "assistant" ? "knowledge.approve" : "channel.activate", db);
    const current = await currentConfigurationRevision(db, input.clientId, input.kind, input.targetId);
    if (!current || current !== input.revision) throw new Error("Configuration changed; review the current revision before approving.");
    const inserted = await db.query(
      `insert into configuration_approvals
       (client_id, kind, target_id, revision, approved_by, evidence)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (client_id, kind, target_id, revision) do nothing returning id`,
      [input.clientId, input.kind, input.targetId, current, input.actor.userId, input.evidence.trim()],
    );
    if (!inserted.rows[0]) return;
    await recordAuditLog({ clientId: input.clientId, actorUserId: input.actor.userId,
      action: `configuration.${input.kind}_approved`, targetType: input.kind,
      targetId: input.targetId, metadata: { revision: current, evidence: input.evidence.trim() } }, db);
  }, { isolationLevel: "serializable", retries: 2 });
}

export async function assertConfigurationApproved(
  db: Queryable, clientId: string, kind: ApprovalKind, targetId: string, revision: string,
): Promise<void> {
  const result = await db.query<RevisionRow>(
    `select revision from configuration_approvals where client_id = $1
     and kind = $2 and target_id = $3 and revision = $4`,
    [clientId, kind, targetId, revision]);
  if (!result.rows[0]) throw new Error("Current configuration requires business approval before publication or activation.");
}

export const channelEvidenceKinds = [
  "ownership", "permissions", "local_test", "provider_accepted", "delivery_observed",
] as const;
export type ChannelEvidenceKind = typeof channelEvidenceKinds[number];

export async function recordChannelActivationEvidence(input: {
  actor: SessionUser; clientId: string; channelId: string; revision: string;
  checkKind: ChannelEvidenceKind; details: string;
}): Promise<void> {
  if (input.actor.role !== "operator") throw new Error("Pronto operator access is required.");
  if (!input.details.trim()) throw new Error("Evidence details are required.");
  await transaction(async (db) => {
    const current = await currentConfigurationRevision(db, input.clientId, "channel", input.channelId);
    if (!current || current !== input.revision) throw new Error("Channel configuration changed; record fresh evidence.");
    await db.query(
      `insert into channel_activation_evidence
       (client_id, channel_id, revision, check_kind, details, recorded_by)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (client_id, channel_id, revision, check_kind) do update
       set details = excluded.details, recorded_by = excluded.recorded_by, recorded_at = now()`,
      [input.clientId, input.channelId, current, input.checkKind, input.details.trim(), input.actor.userId]);
    await recordAuditLog({ clientId: input.clientId, actorUserId: input.actor.userId,
      action: "channel.activation_evidence_recorded", targetType: "channel", targetId: input.channelId,
      metadata: { revision: current, checkKind: input.checkKind } }, db);
  }, { isolationLevel: "serializable", retries: 2 });
}

export async function assertChannelActivationEvidence(
  db: Queryable, clientId: string, channelId: string, revision: string, localOnly: boolean,
): Promise<void> {
  const required: ChannelEvidenceKind[] = localOnly
    ? ["ownership", "local_test"]
    : ["ownership", "permissions", "local_test", "provider_accepted", "delivery_observed"];
  const result = await db.query<{ check_kind: ChannelEvidenceKind }>(
    `select check_kind from channel_activation_evidence
     where client_id = $1 and channel_id = $2 and revision = $3`,
    [clientId, channelId, revision]);
  const found = new Set(result.rows.map((row) => row.check_kind));
  const missing = required.filter((kind) => !found.has(kind));
  if (missing.length) throw new Error(`Activation evidence missing: ${missing.join(", ")}.`);
}

export async function assertOnboardingReadyForChannelActivation(db: Queryable, clientId: string): Promise<void> {
  const result = await db.query<{ stage: string }>(
    `select stage from onboarding_stages where client_id = $1 and stage in
     ('profile', 'communications', 'knowledge', 'testing') and state in ('approved', 'active')`,
    [clientId]);
  const approved = new Set(result.rows.map((row) => row.stage));
  const missing = ["profile", "communications", "knowledge", "testing"].filter((stage) => !approved.has(stage));
  if (missing.length) throw new Error(`Onboarding approval missing: ${missing.join(", ")}.`);
}

export async function getChannelActivationSummary(clientId: string, channelId: string): Promise<{
  revision: string | null; approval: boolean; evidence: ChannelEvidenceKind[];
}> {
  const revision = await currentConfigurationRevision({ query }, clientId, "channel", channelId);
  if (!revision) return { revision: null, approval: false, evidence: [] };
  const [approval, evidence] = await Promise.all([
    query<{ approved: boolean }>(
      `select exists(select 1 from configuration_approvals where client_id = $1 and kind = 'channel'
       and target_id = $2 and revision = $3) as approved`, [clientId, channelId, revision]),
    query<{ check_kind: ChannelEvidenceKind }>(
      "select check_kind from channel_activation_evidence where client_id = $1 and channel_id = $2 and revision = $3",
      [clientId, channelId, revision]),
  ]);
  return { revision, approval: approval.rows[0]?.approved === true,
    evidence: evidence.rows.map((row) => row.check_kind) };
}
