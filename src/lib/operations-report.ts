import { query } from "@/lib/db";
import { listRecentErrorEvents } from "@/lib/error-tracking";

type QueueCount = { status: string; count: string; oldest_at: Date | null };
export async function getOperationsReport() {
  const [inbound, outbound, staff, heartbeat, onboarding, pendingOnboarding, stalledInbound, errors] = await Promise.all([
    query<QueueCount>(
      `select status, count(*)::text as count, min(created_at) as oldest_at
       from inbound_jobs where status in ('pending','failed','processing','dead') group by status`, []),
    query<QueueCount>(
      `select status, count(*)::text as count, min(created_at) as oldest_at
       from outbound_messages where status in ('pending','sending','failed','uncertain','dead') group by status`, []),
    query<QueueCount>(
      `select status, count(*)::text as count, min(created_at) as oldest_at
       from staff_notification_jobs where status in ('pending','sending','failed','uncertain','dead') group by status`, []),
    query<{ updated_at: Date }>(
      "select updated_at from worker_heartbeats where name = 'inbound-outbound'", []),
    query<{ state: string; count: string }>(
      "select state, count(*)::text as count from onboarding_stages group by state", []),
    query<{ count: string }>(
      `select count(distinct client_id)::text as count from onboarding_stages
       where state not in ('approved','active')`, []),
    query<{ count: string }>(
      `select count(*)::text as count from inbound_jobs
       where status = 'processing' and lease_expires_at < now()`, []),
    listRecentErrorEvents({ limit: 25, unacknowledgedOnly: true }),
  ]);
  const heartbeatAt = heartbeat.rows[0]?.updated_at ?? null;
  return { inbound: inbound.rows, outbound: outbound.rows, staff: staff.rows,
    heartbeatAt, workerFresh: Boolean(heartbeatAt && Date.now() - new Date(heartbeatAt).getTime() < 60_000),
    onboarding: onboarding.rows,
    pendingOnboardingBusinesses: Number(pendingOnboarding.rows[0]?.count ?? 0),
    stalledInbound: Number(stalledInbound.rows[0]?.count ?? 0), errors };
}

export async function getOperationsAttention(limit = 50): Promise<Array<{
  id: string; client_id: string; client_name: string; kind: string; status: string;
  created_at: Date; last_error: string | null;
}>> {
  const result = await query<{
    id: string; client_id: string; client_name: string; kind: string;
    status: string; created_at: Date; last_error: string | null;
  }>(
    `select a.* from (
       select j.id, j.client_id, c.name as client_name, 'inbound' as kind,
         j.status::text, j.created_at, j.last_error from inbound_jobs j
         join clients c on c.id = j.client_id where j.status = 'dead'
       union all
       select o.id, o.client_id, c.name, 'outbound', o.status::text, o.created_at, o.last_error
         from outbound_messages o join clients c on c.id = o.client_id
         where o.status in ('uncertain', 'dead')
       union all
       select n.id, n.client_id, c.name, 'staff notification', n.status, n.created_at, n.last_error
         from staff_notification_jobs n join clients c on c.id = n.client_id
         where n.status in ('failed', 'uncertain', 'dead')
     ) a order by a.created_at desc limit $1`, [Math.min(Math.max(limit, 1), 100)]);
  return result.rows.map((row) => ({ ...row,
    last_error: row.last_error ? "Failure recorded. Use the job ID to inspect sanitized logs." : null }));
}
