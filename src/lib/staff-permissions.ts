import { recordAuditLog } from "@/lib/audit";
import { query, transaction, type Queryable } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";

export const staffCapabilities = [
  "knowledge.approve", "channel.activate", "conversation.respond",
  "conversation.release", "staff.permissions.manage",
] as const;
export type StaffCapability = typeof staffCapabilities[number];

export function isStaffCapability(value: string): value is StaffCapability {
  return (staffCapabilities as readonly string[]).includes(value);
}

export async function hasStaffCapability(
  user: SessionUser, clientId: string, capability: StaffCapability,
  db: Queryable = { query },
): Promise<boolean> {
  if (user.role === "operator") return true;
  if (user.role !== "client" || user.clientId !== clientId) return false;
  const result = await db.query<{ allowed: boolean }>(
    `select exists(select 1 from staff_permission_grants g
       join users u on u.id = g.user_id and u.client_id = g.client_id
       where g.client_id = $1 and g.user_id = $2 and g.permission = $3) as allowed`,
    [clientId, user.userId, capability],
  );
  return result.rows[0]?.allowed === true;
}

export async function requireStaffCapability(
  user: SessionUser, clientId: string, capability: StaffCapability,
  db: Queryable = { query },
): Promise<void> {
  if (!await hasStaffCapability(user, clientId, capability, db)) {
    throw new Error(`Permission ${capability} is required.`);
  }
}

export async function canViewBusinessConversation(user: SessionUser, clientId: string): Promise<boolean> {
  if (user.role !== "client" || user.clientId !== clientId) return false;
  return await hasStaffCapability(user, clientId, "conversation.respond") ||
    await hasStaffCapability(user, clientId, "conversation.release");
}

export async function setStaffCapability(input: {
  actor: SessionUser; clientId: string; userId: string;
  capability: StaffCapability; granted: boolean; evidence: string;
}): Promise<void> {
  if (!input.evidence.trim()) throw new Error("Authorization evidence is required.");
  await transaction(async (db) => {
    await requireStaffCapability(input.actor, input.clientId, "staff.permissions.manage", db);
    const target = await db.query<{ role: string }>(
      "select role from users where id = $1 and client_id = $2 for update",
      [input.userId, input.clientId],
    );
    if (target.rows[0]?.role !== "client") throw new Error("Business staff member not found.");
    if (input.granted) {
      await db.query(
        `insert into staff_permission_grants (client_id, user_id, permission, granted_by)
         values ($1, $2, $3, $4) on conflict do nothing`,
        [input.clientId, input.userId, input.capability, input.actor.userId],
      );
    } else {
      await db.query(
        "delete from staff_permission_grants where client_id = $1 and user_id = $2 and permission = $3",
        [input.clientId, input.userId, input.capability],
      );
    }
    await recordAuditLog({ clientId: input.clientId, actorUserId: input.actor.userId,
      action: input.granted ? "staff.permission_granted" : "staff.permission_revoked",
      targetType: "user", targetId: input.userId,
      metadata: { capability: input.capability, evidence: input.evidence.trim() } }, db);
  }, { isolationLevel: "serializable", retries: 2 });
}

export async function listStaffCapabilities(clientId: string): Promise<Array<{
  user_id: string; permission: StaffCapability; granted_at: Date;
}>> {
  const result = await query<{ user_id: string; permission: StaffCapability; granted_at: Date }>(
    "select user_id, permission, granted_at from staff_permission_grants where client_id = $1 order by user_id, permission",
    [clientId],
  );
  return result.rows;
}
