import { recordAuditLog } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth";
import { query, transaction } from "@/lib/db";
import { requireStaffCapability } from "@/lib/staff-permissions";

export const onboardingStageKeys = ["profile", "communications", "knowledge", "testing", "activation"] as const;
export type OnboardingStageKey = typeof onboardingStageKeys[number];
export type OnboardingStage = {
  client_id: string; stage: OnboardingStageKey;
  state: "draft" | "pending_review" | "approved" | "active";
  revision: number; details: Record<string, unknown>; evidence: Record<string, unknown>;
  blockers: string[]; not_applicable_reason: string | null;
  responsible_user_id: string | null; updated_by: string | null;
  approved_by: string | null; approved_at: Date | null; updated_at: Date;
};

export function isOnboardingStage(value: string): value is OnboardingStageKey {
  return (onboardingStageKeys as readonly string[]).includes(value);
}

export async function listOnboardingStages(clientId: string): Promise<OnboardingStage[]> {
  const result = await query<OnboardingStage>(
    `select * from onboarding_stages where client_id = $1
     order by array_position(array['profile','communications','knowledge','testing','activation'], stage)`,
    [clientId]);
  return result.rows;
}

export function nextOnboardingAction(stages: OnboardingStage[]): string {
  const stage = onboardingStageKeys.find((key) =>
    !stages.some((row) => row.stage === key && (row.state === "approved" || row.state === "active")));
  if (!stage) return "Monitor the active business and review changes.";
  const row = stages.find((item) => item.stage === stage);
  return row?.state === "pending_review" ? `Await business approval: ${stage}.` : `Complete ${stage} setup.`;
}

function requiredFields(stage: OnboardingStageKey): { details: string[]; evidence: string[] } {
  switch (stage) {
    case "profile": return { details: ["businessName", "timezone", "serviceScope"], evidence: ["sourceReview"] };
    case "communications": return { details: ["customerChannels", "staffPreference"], evidence: ["identityReview"] };
    case "knowledge": return { details: ["knowledgeScope", "escalationRules"], evidence: ["sourceReview"] };
    case "testing": return { details: ["testPlan"], evidence: ["localTest", "handoffTest"] };
    case "activation": return { details: ["monitorOwner", "rollbackContact"], evidence: ["approvalRecord"] };
  }
}

function hasValue(value: unknown): boolean {
  return typeof value === "string" ? Boolean(value.trim())
    : Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null;
}

export async function changeOnboardingStage(input: {
  actor: SessionUser; clientId: string; stage: OnboardingStageKey;
  action: "save" | "submit" | "approve" | "activate";
  expectedRevision: number; details?: Record<string, unknown>;
  evidence?: Record<string, unknown>; blockers?: string[];
  notApplicableReason?: string | null; responsibleUserId?: string | null;
}): Promise<OnboardingStage> {
  return transaction(async (db) => {
    const result = await db.query<OnboardingStage>(
      "select * from onboarding_stages where client_id = $1 and stage = $2 for update",
      [input.clientId, input.stage]);
    const row = result.rows[0];
    if (!row) throw new Error("Onboarding stage not found.");
    if (row.revision !== input.expectedRevision) throw new Error("This stage changed; reload before continuing.");
    if (input.action === "save" || input.action === "submit") {
      if (input.actor.role !== "operator") throw new Error("Pronto operator access is required to prepare onboarding.");
      const details = input.details ?? row.details;
      const evidence = input.evidence ?? row.evidence;
      const blockers = input.blockers ?? row.blockers;
      if (input.action === "submit") {
        const required = requiredFields(input.stage);
        if (required.details.some((field) => !hasValue(details[field])) ||
            required.evidence.some((field) => !hasValue(evidence[field])) || blockers.length)
          throw new Error("Complete required fields and resolve blockers before review.");
        const previous = onboardingStageKeys.slice(0, onboardingStageKeys.indexOf(input.stage));
        if (previous.length) {
          const stages = await db.query<{ stage: string; state: string }>(
            "select stage, state from onboarding_stages where client_id = $1", [input.clientId]);
          if (previous.some((stage) => !stages.rows.some((item) => item.stage === stage &&
            (item.state === "approved" || item.state === "active"))))
            throw new Error("Approve preceding onboarding stages first.");
        }
      }
      const changed = await db.query<OnboardingStage>(
        `update onboarding_stages set state = $3, revision = revision + 1,
         details = $4::jsonb, evidence = $5::jsonb, blockers = $6::jsonb,
         not_applicable_reason = $7, responsible_user_id = $8, updated_by = $9,
         approved_by = null, approved_at = null, updated_at = now()
         where client_id = $1 and stage = $2 returning *`,
        [input.clientId, input.stage, input.action === "submit" ? "pending_review" : "draft",
          JSON.stringify(details), JSON.stringify(evidence), JSON.stringify(blockers),
          input.notApplicableReason ?? row.not_applicable_reason,
          input.responsibleUserId ?? row.responsible_user_id, input.actor.userId]);
      await recordAuditLog({ clientId: input.clientId, actorUserId: input.actor.userId,
        action: `onboarding.${input.action}`, targetType: "onboarding_stage",
        metadata: { stage: input.stage, revision: changed.rows[0].revision } }, db);
      return changed.rows[0];
    }
    if (input.action === "approve") {
      if (input.actor.role !== "client" || input.actor.clientId !== input.clientId)
        throw new Error("Business approval requires an authorized member of this business.");
      await requireStaffCapability(input.actor, input.clientId,
        input.stage === "profile" || input.stage === "knowledge" || input.stage === "testing"
          ? "knowledge.approve" : "channel.activate", db);
      if (row.state !== "pending_review") throw new Error("Only a submitted stage can be approved.");
      const changed = await db.query<OnboardingStage>(
        `update onboarding_stages set state = 'approved', approved_by = $3, approved_at = now(),
         updated_at = now() where client_id = $1 and stage = $2 returning *`,
        [input.clientId, input.stage, input.actor.userId]);
      await recordAuditLog({ clientId: input.clientId, actorUserId: input.actor.userId,
        action: "onboarding.approved", targetType: "onboarding_stage",
        metadata: { stage: input.stage, revision: row.revision } }, db);
      return changed.rows[0];
    }
    if (input.stage !== "activation" || input.actor.role !== "operator" || row.state !== "approved")
      throw new Error("Approved activation and Pronto operator access are required.");
    const active = await db.query<{ id: string }>(
      "select id from channels where client_id = $1 and status = 'active' limit 1", [input.clientId]);
    if (!active.rows[0]) throw new Error("An approved active customer channel is required.");
    const changed = await db.query<OnboardingStage>(
      `update onboarding_stages set state = 'active', updated_by = $3, updated_at = now()
       where client_id = $1 and stage = $2 returning *`, [input.clientId, input.stage, input.actor.userId]);
    await db.query("update clients set status = 'live', updated_at = now() where id = $1", [input.clientId]);
    await recordAuditLog({ clientId: input.clientId, actorUserId: input.actor.userId,
      action: "onboarding.activated", targetType: "client", targetId: input.clientId,
      metadata: { stageRevision: row.revision } }, db);
    return changed.rows[0];
  }, { isolationLevel: "serializable", retries: 2 });
}
