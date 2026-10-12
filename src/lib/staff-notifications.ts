import { recordAuditLog } from "@/lib/audit";
import { query, transaction, type Queryable } from "@/lib/db";
import { notifyOwnerOfEscalation, notifyTimedStaffOfEscalation } from "@/lib/escalations";
import { logWarn } from "@/lib/logger";

export async function enqueueStaffNotification(db: Queryable, clientId: string, escalationId: string): Promise<void> {
  await db.query(
    `insert into staff_notification_jobs (client_id, escalation_id, kind, schedule_key)
     values ($1, $2, 'initial', 'initial') on conflict (escalation_id,kind,schedule_key) do nothing`,
    [clientId, escalationId]);
  await scheduleEscalationNotifications(db, clientId, escalationId);
}

export async function scheduleEscalationNotifications(db: Queryable, clientId: string,
  escalationId: string): Promise<void> {
  const escalation = await db.query<{ created_at: Date; status: string }>(
    "select created_at, status from escalations where id = $1 and client_id = $2", [escalationId, clientId]);
  if (!escalation.rows[0] || !["open", "claimed"].includes(escalation.rows[0].status)) return;
  const latest = await db.query<{ version: number; policy: {
    targetMinutes: number | null; timezone: string; staffedHours: Record<string, { start: string; end: string }>;
    reminderMinutes: number[]; initialDestinationId: string | null; backupDestinationId: string | null;
  } }>("select version, policy from escalation_policy_versions where client_id = $1 order by version desc limit 1", [clientId]);
  const current = latest.rows[0];
  if (!current) return;
  const policy = current.policy;
  await db.query(`update staff_notification_jobs set status = 'cancelled', last_error = 'Policy revision changed; job invalidated.',
    updated_at = now() where client_id = $1 and escalation_id = $2 and kind <> 'initial'
      and policy_version is distinct from $3 and status in ('pending','failed')`,
    [clientId, escalationId, current.version]);
  if (policy.targetMinutes === null) return;
  if (policy.initialDestinationId) for (const offset of [...new Set(policy.reminderMinutes ?? [])]) {
    const due = computeStaffedDue(escalation.rows[0].created_at, offset, policy.timezone, policy.staffedHours);
    await db.query(`insert into staff_notification_jobs
      (client_id,escalation_id,destination_id,kind,schedule_key,policy_version,available_at)
      values ($1,$2,$3,'reminder',$4,$5,$6)
      on conflict (escalation_id,kind,schedule_key) do nothing`,
      [clientId, escalationId, policy.initialDestinationId, `${current.version}:${offset}`, current.version, due]);
  }
  if (policy.backupDestinationId) {
    const due = computeStaffedDue(escalation.rows[0].created_at, policy.targetMinutes, policy.timezone, policy.staffedHours);
    await db.query(`insert into staff_notification_jobs
      (client_id,escalation_id,destination_id,kind,schedule_key,policy_version,available_at)
      values ($1,$2,$3,'backup',$4,$5,$6)
      on conflict (escalation_id,kind,schedule_key) do nothing`,
      [clientId, escalationId, policy.backupDestinationId, `${current.version}:${policy.targetMinutes}`, current.version, due]);
  }
}

// Offsets measure elapsed time from escalation creation. If due outside staffed
// hours, defer to the next real minute whose local wall clock is staffed.
export function computeStaffedDue(start: Date, minutes: number, timezone: string,
  staffedHours: Record<string, { start: string; end: string }>): Date {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 10080) throw new Error("Invalid reminder offset.");
  const target = new Date(start.getTime() + minutes * 60_000);
  const slots = Object.keys(staffedHours ?? {});
  if (!slots.length) return target;
  const isStaffed = staffedHoursChecker(timezone, staffedHours);
  const cursor = new Date(Math.ceil(target.getTime() / 60_000) * 60_000);
  for (let step = 0; step <= 10080; step += 1) {
    if (isStaffed(cursor)) return new Date(cursor);
    cursor.setTime(cursor.getTime() + 60_000);
  }
  throw new Error("Reminder cannot be scheduled within one week of staffed time.");
}

export function isWithinStaffedHours(at: Date, timezone: string,
  staffedHours: Record<string, { start: string; end: string }>): boolean {
  return staffedHoursChecker(timezone, staffedHours)(at);
}
function staffedHoursChecker(timezone: string,
  staffedHours: Record<string, { start: string; end: string }>): (at: Date) => boolean {
  if (!Object.keys(staffedHours ?? {}).length) return () => true;
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return (at) => {
    const parts = formatter.formatToParts(at);
    const day = weekdays[parts.find((part) => part.type === "weekday")?.value ?? ""];
    const time = `${parts.find((part) => part.type === "hour")?.value}:${parts.find((part) => part.type === "minute")?.value}`;
    const hours = staffedHours[String(day)];
    return Boolean(hours && time >= hours.start && time < hours.end);
  };
}

export async function markExpiredStaffNotificationsUncertain(): Promise<number> {
  const result = await query(
    `update staff_notification_jobs set status = 'uncertain',
       last_error = 'Send lease expired; reconcile delivery before retrying.', updated_at = now()
     where status = 'sending' and lease_expires_at < now()`, []);
  return result.rowCount ?? 0;
}

export async function flushStaffNotifications(limit = 25, clientId?: string): Promise<{ attempted: number; sent: number; failed: number }> {
  let attempted = 0;
  let sent = 0;
  let failed = 0;
  for (let index = 0; index < Math.max(0, Math.min(limit, 100)); index += 1) {
    const claimed = await query<{ id: string; client_id: string; escalation_id: string; attempt_count: number;
      kind: "initial" | "reminder" | "backup"; destination_id: string | null; policy_version: number | null }>(
      `update staff_notification_jobs set status = 'sending', attempt_count = attempt_count + 1,
         lease_expires_at = now() + interval '2 minutes', updated_at = now()
       where id = (select id from staff_notification_jobs
         where status in ('pending', 'failed') and available_at <= now() and attempt_count < 5
           and ($1::uuid is null or client_id = $1)
         order by available_at, created_at for update skip locked limit 1)
       returning id, client_id, escalation_id, attempt_count, kind, destination_id, policy_version`, [clientId ?? null]);
    const job = claimed.rows[0];
    if (!job) break;
    attempted += 1;
    try {
      if (job.kind !== "initial") {
        const eligible = await query<{ allowed: boolean }>(`select (
          e.status in ('open','claimed') and c.status = 'escalated' and
          e.client_id = $2 and p.version = $3 and
          not exists (select 1 from outbound_messages o where o.escalation_id = e.id
            and o.client_id = e.client_id and o.metadata->>'purpose' = 'escalation_resolution_reply')
        ) as allowed from escalations e join conversations c on c.id = e.conversation_id
          left join lateral (select version from escalation_policy_versions where client_id = e.client_id
            order by version desc limit 1) p on true where e.id = $1`,
          [job.escalation_id, job.client_id, job.policy_version]);
        if (!eligible.rows[0]?.allowed) {
          await query("update staff_notification_jobs set status = 'cancelled', last_error = 'Escalation resolved, staff responded, or policy changed.', updated_at = now() where id = $1 and status = 'sending'", [job.id]);
          continue;
        }
      }
      const result = job.kind === "initial" ? await notifyOwnerOfEscalation(job.escalation_id, job.client_id)
        : await notifyTimedStaffOfEscalation(job.escalation_id, job.client_id, job.kind, job.destination_id);
      const status = result.status === "sent" ? "sent"
        : result.ambiguous ? "uncertain"
        : result.status === "skipped" || job.attempt_count >= 5 ? "dead" : "failed";
      await query(
        `update staff_notification_jobs set status = $2, last_error = $3,
         available_at = case when $2 = 'failed' then now() + ($4 * interval '30 seconds') else available_at end,
         lease_expires_at = null, sent_at = case when $2 = 'sent' then now() else sent_at end,
         provider_message_id = case when $2 = 'sent' then $5 else provider_message_id end,
         transport_kind = case when $2 = 'sent' then $6 else transport_kind end,
         updated_at = now() where id = $1 and status = 'sending'`,
        [job.id, status, status === "sent" ? null : result.detail, Math.min(16, 2 ** job.attempt_count),
          result.providerMessageId ?? null, result.channelKind ?? null]);
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
  await transaction(async (db) => {
    const result = await db.query(
      `update staff_notification_jobs set status = 'pending', attempt_count = 0,
         available_at = now(), lease_expires_at = null, last_error = null, updated_at = now()
       where id = $1 and client_id = $2 and status in ('dead', 'uncertain')`,
      [input.jobId, input.clientId]);
    if (!result.rowCount) throw new Error("Notification is not eligible for manual retry.");
    await recordAuditLog({ clientId: input.clientId, actorUserId: input.actorUserId,
      action: "staff_notification.manual_retry", targetType: "staff_notification_job", targetId: input.jobId,
      metadata: { reconciliation: input.reconciliation.trim() } }, db);
  });
}
