import { recordAuditLog } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth";
import { query, transaction } from "@/lib/db";
import { requireStaffCapability } from "@/lib/staff-permissions";

export type StaffDestination = {
  id: string; client_id: string; kind: "email" | "whatsapp" | "telegram";
  destination: string; recipient_user_id: string | null;
  audience: "business" | "operator"; verified_at: Date | null; enabled: boolean;
  verification_evidence: string | null;
};

export async function listStaffDestinations(clientId: string): Promise<StaffDestination[]> {
  const result = await query<StaffDestination>(
    "select * from staff_notification_destinations where client_id = $1 order by updated_at desc", [clientId]);
  return result.rows;
}

export async function saveStaffDestination(input: {
  actor: SessionUser; clientId: string; id?: string;
  kind: StaffDestination["kind"]; destination: string;
  recipientUserId?: string | null; audience: StaffDestination["audience"];
  verified: boolean; enabled: boolean; verificationEvidence?: string;
}): Promise<void> {
  const destination = input.destination.trim();
  if (!destination || destination.length > 254 || /[\r\n]/.test(destination)) throw new Error("Invalid staff destination.");
  if (input.kind === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(destination))
    throw new Error("A valid staff email address is required.");
  if (input.kind === "whatsapp" && !/^\+[1-9]\d{7,14}$/.test(destination))
    throw new Error("WhatsApp staff number must be in E.164 format.");
  if (input.audience === "operator" && input.actor.role !== "operator")
    throw new Error("Only Pronto may configure an operator destination.");
  if (input.verified && input.actor.role !== "operator")
    throw new Error("Destination verification requires a Pronto operator.");
  if (input.enabled && !input.verified) throw new Error("Verify the destination before enabling it.");
  if (input.verified && !input.verificationEvidence?.trim())
    throw new Error("Destination verification evidence is required.");
  if (input.enabled && !input.recipientUserId)
    throw new Error("An enabled staff destination must be bound to an authorized user.");
  await transaction(async (db) => {
    await requireStaffCapability(input.actor, input.clientId, "staff.permissions.manage", db);
    if (input.recipientUserId) {
      const user = await db.query<{ role: string }>("select role from users where id = $1 and (client_id = $2 or role = 'operator')",
        [input.recipientUserId, input.clientId]);
      if (!user.rows[0] || user.rows[0].role !== (input.audience === "business" ? "client" : "operator"))
        throw new Error("Recipient user does not match the destination audience.");
      if (input.enabled && input.audience === "business") {
        const capability = await db.query<{ allowed: boolean }>(
          `select exists(select 1 from staff_permission_grants where client_id = $1 and user_id = $2
           and permission in ('conversation.respond', 'conversation.release')) as allowed`,
          [input.clientId, input.recipientUserId]);
        if (!capability.rows[0]?.allowed) throw new Error("Recipient needs conversation access before notifications are enabled.");
      }
    }
    const existing = input.id ? await db.query<StaffDestination>(
      "select * from staff_notification_destinations where id = $1 and client_id = $2 for update",
      [input.id, input.clientId]) : null;
    if (input.id && !existing?.rows[0]) throw new Error("Staff destination not found.");
    const changedIdentity = existing?.rows[0] && (
      existing.rows[0].kind !== input.kind || existing.rows[0].destination !== destination ||
      existing.rows[0].recipient_user_id !== (input.recipientUserId ?? null));
    const verified = input.verified && !changedIdentity;
    if (input.id) {
      await db.query(
        `update staff_notification_destinations set kind = $3, destination = $4,
         recipient_user_id = $5, audience = $6,
         verified_at = case when $7 then now() else null end,
         verification_evidence = case when $7 then $9 else null end,
         enabled = $8 and $7, updated_at = now() where id = $1 and client_id = $2`,
        [input.id, input.clientId, input.kind, destination, input.recipientUserId ?? null,
          input.audience, verified, input.enabled, input.verificationEvidence?.trim() ?? null]);
    } else {
      await db.query(
        `insert into staff_notification_destinations
         (client_id, kind, destination, recipient_user_id, audience, verified_at, enabled, created_by, verification_evidence)
         values ($1, $2, $3, $4, $5, case when $6 then now() else null end, $7, $8, $9)
         on conflict (client_id, kind, destination) do nothing`,
        [input.clientId, input.kind, destination, input.recipientUserId ?? null, input.audience,
          verified, input.enabled && verified, input.actor.userId, input.verificationEvidence?.trim() ?? null]);
    }
    await recordAuditLog({ clientId: input.clientId, actorUserId: input.actor.userId,
      action: "staff.destination_saved", targetType: "staff_destination",
      metadata: { kind: input.kind, audience: input.audience, verified, enabled: input.enabled && verified } }, db);
  }, { isolationLevel: "serializable", retries: 2 });
}

export type EscalationPolicy = {
  targetMinutes: number | null;
  timezone: string;
  staffedHours: Record<string, { start: string; end: string }>;
  initialDestinationId: string | null;
  reminderMinutes: number[];
  backupDestinationId: string | null;
  outOfHoursAcknowledgement: string | null;
};

export async function getEscalationPolicy(clientId: string): Promise<{ version: number; policy: EscalationPolicy } | null> {
  const result = await query<{ version: number; policy: EscalationPolicy }>(
    "select version, policy from escalation_policy_versions where client_id = $1 order by version desc limit 1", [clientId]);
  return result.rows[0] ?? null;
}

export async function saveEscalationPolicy(input: {
  actor: SessionUser; clientId: string; expectedVersion: number; policy: EscalationPolicy;
}): Promise<number> {
  const policy = input.policy;
  if (!policy || typeof policy !== "object" || !policy.staffedHours ||
      !Array.isArray(policy.reminderMinutes) || typeof policy.timezone !== "string")
    throw new Error("Invalid escalation policy.");
  if (policy.targetMinutes !== null && (!Number.isInteger(policy.targetMinutes) || policy.targetMinutes < 1 || policy.targetMinutes > 10080))
    throw new Error("Response target must be 1–10080 minutes, or unset.");
  try { new Intl.DateTimeFormat("en", { timeZone: policy.timezone }); }
  catch { throw new Error("Invalid timezone."); }
  if (policy.reminderMinutes.some((minute) => !Number.isInteger(minute) || minute < 1 || minute > 10080))
    throw new Error("Invalid reminder interval.");
  for (const [day, hours] of Object.entries(policy.staffedHours)) {
    if (!/^[0-6]$/.test(day) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hours.start) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(hours.end) || hours.start >= hours.end)
      throw new Error("Invalid staffed hours.");
  }
  return transaction(async (db) => {
    await requireStaffCapability(input.actor, input.clientId, "staff.permissions.manage", db);
    const latest = await db.query<{ version: number }>(
      "select version from escalation_policy_versions where client_id = $1 order by version desc limit 1 for update",
      [input.clientId]);
    const current = latest.rows[0]?.version ?? 0;
    if (current !== input.expectedVersion) throw new Error("Escalation policy changed; reload before saving.");
    for (const destinationId of [policy.initialDestinationId, policy.backupDestinationId]) {
      if (!destinationId) continue;
      const destination = await db.query("select id from staff_notification_destinations where id = $1 and client_id = $2 and enabled = true and verified_at is not null",
        [destinationId, input.clientId]);
      if (!destination.rows[0]) throw new Error("Escalation destination must be verified for this business.");
    }
    await db.query(
      "insert into escalation_policy_versions (client_id, version, policy, changed_by) values ($1, $2, $3::jsonb, $4)",
      [input.clientId, current + 1, JSON.stringify(policy), input.actor.userId]);
    await recordAuditLog({ clientId: input.clientId, actorUserId: input.actor.userId,
      action: "escalation_policy.updated", targetType: "client", targetId: input.clientId,
      metadata: { version: current + 1, hasTarget: policy.targetMinutes !== null } }, db);
    return current + 1;
  }, { isolationLevel: "serializable", retries: 2 });
}
