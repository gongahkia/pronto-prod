import { query } from "@/lib/db";

type AuditDb = {
  query: (text: string, values?: unknown[]) => Promise<unknown>;
};

export type AuditLogInput = {
  clientId: string | null;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function recordAuditLog(
  input: AuditLogInput,
  db: AuditDb = { query },
): Promise<void> {
  await db.query(
    `
      insert into audit_logs (client_id, actor_user_id, action, target_type, target_id, metadata)
      values ($1, $2, $3, $4, $5, $6)
    `,
    [
      input.clientId,
      input.actorUserId,
      input.action,
      input.targetType,
      input.targetId ?? null,
      input.metadata ?? {},
    ],
  );
}
