import { recordAuditLog } from "@/lib/audit";
import { query, type Queryable } from "@/lib/db";
import { notifyOwnerOfEscalation } from "@/lib/escalations";
import { logWarn } from "@/lib/logger";

export async function enqueueStaffNotification(db: Queryable, clientId: string, escalationId: string): Promise<void> {
  await db.query(
    `insert into staff_notification_jobs (client_id, escalation_id)
     values ($1, $2) on conflict (escalation_id) do nothing`,
    [clientId, escalationId]);
}

export async function markExpiredStaffNotificationsUncertain(): Promise<number> {
  const result = await query(
    `update staff_notification_jobs set status = 'uncertain',
       last_error = 'Send lease expired; reconcile delivery before retrying.', updated_at = now()
     where status = 'sending' and lease_expires_at < now()`, []);
  return result.rowCount ?? 0;
}

export async function flushStaffNotifications(limit = 25): Promise<{ attempted: number; sent: number; failed: number }> {
  let attempted = 0;
  let sent = 0;
  let failed = 0;
  for (let index = 0; index < Math.max(0, Math.min(limit, 100)); index += 1) {
    const claimed = await query<{ id: string; client_id: string; escalation_id: string; attempt_count: number }>(
      `update staff_notification_jobs set status = 'sending', attempt_count = attempt_count + 1,
         lease_expires_at = now() + interval '2 minutes', updated_at = now()
       where id = (select id from staff_notification_jobs
         where status in ('pending', 'failed') and available_at <= now() and attempt_count < 5
         order by available_at, created_at for update skip locked limit 1)
       returning id, client_id, escalation_id, attempt_count`, []);
    const job = claimed.rows[0];
    if (!job) break;
    attempted += 1;
    try {
      const result = await notifyOwnerOfEscalation(job.escalation_id, job.client_id);
      const status = result.status === "sent" ? "sent"
        : result.ambiguous ? "uncertain"
        : result.status === "skipped" || job.attempt_count >= 5 ? "dead" : "failed";
      await query(
        `update staff_notification_jobs set status = $2, last_error = $3,
         available_at = case when $2 = 'failed' then now() + ($4 * interval '30 seconds') else available_at end,
         lease_expires_at = null, sent_at = case when $2 = 'sent' then now() else sent_at end,
         updated_at = now() where id = $1 and status = 'sending'`,
        [job.id, status, status === "sent" ? null : result.detail, Math.min(16, 2 ** job.attempt_count)]);
      if (status === "sent") sent += 1;
      else failed += 1;
    } catch (error) {
      // The provider may have accepted the message before a local failure.
      await query("update staff_notification_jobs set status = 'uncertain', last_error = $2, updated_at = now() where id = $1",
        [job.id, "Unexpected send failure; reconcile delivery before retrying."]);
      logWarn("staff_notification.uncertain", { jobId: job.id, clientId: job.client_id, error });
      failed += 1;
    }
  }
  return { attempted, sent, failed };
}

export async function retryStaffNotification(input: {
  clientId: string; jobId: string; actorUserId: string; reconciliation: string;
}): Promise<void> {
  if (!input.reconciliation.trim()) throw new Error("Record the reconciliation result before retrying.");
  const result = await query(
    `update staff_notification_jobs set status = 'pending', attempt_count = 0,
       available_at = now(), lease_expires_at = null, last_error = null, updated_at = now()
     where id = $1 and client_id = $2 and status in ('dead', 'uncertain')`,
    [input.jobId, input.clientId]);
  if (!result.rowCount) throw new Error("Notification is not eligible for manual retry.");
  await recordAuditLog({ clientId: input.clientId, actorUserId: input.actorUserId,
    action: "staff_notification.manual_retry", targetType: "staff_notification_job", targetId: input.jobId,
    metadata: { reconciliation: input.reconciliation.trim() } });
}
