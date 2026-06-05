import { query } from "@/lib/db";
import type {
  KnowledgeRefreshRequest,
  KnowledgeRefreshStatus,
} from "@/lib/types";

export async function getKnowledgeRefreshRequests(
  clientId: string,
  limit = 8,
): Promise<KnowledgeRefreshRequest[]> {
  const result = await query<KnowledgeRefreshRequest>(
    `
      select *
      from knowledge_refresh_requests
      where client_id = $1
      order by
        case when status = 'open' then 0 else 1 end,
        due_at asc,
        created_at desc
      limit $2
    `,
    [clientId, limit],
  );
  return result.rows;
}

export async function createKnowledgeRefreshRequest(input: {
  clientId: string;
  actorUserId?: string;
  cadence?: string;
  dueAt?: Date;
  notes?: string;
}): Promise<KnowledgeRefreshRequest> {
  const result = await query<KnowledgeRefreshRequest>(
    `
      insert into knowledge_refresh_requests (
        client_id,
        cadence,
        due_at,
        notes,
        created_by_user_id
      )
      values ($1, $2, $3, $4, $5)
      returning *
    `,
    [
      input.clientId,
      normalizeCadence(input.cadence),
      input.dueAt ?? defaultMonthlyDueAt(),
      normalizeNotes(input.notes),
      input.actorUserId ?? null,
    ],
  );
  return result.rows[0];
}

export async function resolveKnowledgeRefreshRequest(input: {
  requestId: string;
  clientId: string;
  actorUserId?: string;
  status: Extract<KnowledgeRefreshStatus, "completed" | "skipped">;
  notes?: string;
}): Promise<KnowledgeRefreshRequest | null> {
  const result = await query<KnowledgeRefreshRequest>(
    `
      update knowledge_refresh_requests
      set status = $3,
          notes = coalesce($4, notes),
          completed_by_user_id = $5,
          completed_at = now(),
          updated_at = now()
      where id = $1
        and client_id = $2
        and status = 'open'
      returning *
    `,
    [
      input.requestId,
      input.clientId,
      input.status,
      normalizeNotes(input.notes),
      input.actorUserId ?? null,
    ],
  );
  return result.rows[0] ?? null;
}

function defaultMonthlyDueAt(): Date {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
}

function normalizeCadence(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed || "monthly";
}

function normalizeNotes(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}
