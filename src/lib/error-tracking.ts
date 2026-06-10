import { query } from "@/lib/db";
import { logError, logWarn, redactErrorMessage, redactForLog } from "@/lib/logger";

export type ErrorEventSource =
  | "webhook"
  | "llm"
  | "outbound"
  | "database"
  | "channel"
  | "agent"
  | "other";

export type ErrorEventSeverity = "error" | "warning";

export type ErrorEvent = {
  id: string;
  eventName: string;
  severity: ErrorEventSeverity;
  source: ErrorEventSource;
  requestId: string | null;
  clientId: string | null;
  channelId: string | null;
  message: string;
  metadata: Record<string, unknown>;
  occurredAt: Date;
  alertedAt: Date | null;
  acknowledgedAt: Date | null;
};

export type RecordErrorEventInput = {
  eventName: string;
  source: ErrorEventSource;
  message: string;
  severity?: ErrorEventSeverity;
  requestId?: string | null;
  clientId?: string | null;
  channelId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function recordErrorEvent(
  input: RecordErrorEventInput,
): Promise<ErrorEvent | null> {
  const severity = input.severity ?? "error";
  const metadata = (redactForLog(input.metadata ?? {}) ?? {}) as Record<
    string,
    unknown
  >;
  try {
    const result = await query<{
      id: string;
      event_name: string;
      severity: ErrorEventSeverity;
      source: ErrorEventSource;
      request_id: string | null;
      client_id: string | null;
      channel_id: string | null;
      message: string;
      metadata: Record<string, unknown>;
      occurred_at: Date;
      alerted_at: Date | null;
      acknowledged_at: Date | null;
    }>(
      `insert into error_events
         (event_name, severity, source, request_id, client_id, channel_id, message, metadata)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id, event_name, severity, source, request_id, client_id,
                 channel_id, message, metadata, occurred_at, alerted_at, acknowledged_at`,
      [
        input.eventName,
        severity,
        input.source,
        input.requestId ?? null,
        input.clientId ?? null,
        input.channelId ?? null,
        redactErrorMessage(input.message),
        metadata,
      ],
    );
    const row = result.rows[0];
    const event: ErrorEvent = {
      id: row.id,
      eventName: row.event_name,
      severity: row.severity,
      source: row.source,
      requestId: row.request_id,
      clientId: row.client_id,
      channelId: row.channel_id,
      message: row.message,
      metadata: row.metadata,
      occurredAt: row.occurred_at,
      alertedAt: row.alerted_at,
      acknowledgedAt: row.acknowledged_at,
    };
    await dispatchExternalAlert(event);
    return event;
  } catch (persistError) {
    // never throw from error tracking; logger remains the source of truth
    logError("error_tracking.persist_failed", {
      eventName: input.eventName,
      error: persistError,
    });
    return null;
  }
}

export async function listRecentErrorEvents(input: {
  limit?: number;
  source?: ErrorEventSource;
  unacknowledgedOnly?: boolean;
} = {}): Promise<ErrorEvent[]> {
  const limit = clampLimit(input.limit ?? 50);
  const where: string[] = [];
  const values: unknown[] = [];
  if (input.source) {
    values.push(input.source);
    where.push(`source = $${values.length}`);
  }
  if (input.unacknowledgedOnly) {
    where.push("acknowledged_at is null");
  }
  values.push(limit);
  const result = await query<{
    id: string;
    event_name: string;
    severity: ErrorEventSeverity;
    source: ErrorEventSource;
    request_id: string | null;
    client_id: string | null;
    channel_id: string | null;
    message: string;
    metadata: Record<string, unknown>;
    occurred_at: Date;
    alerted_at: Date | null;
    acknowledged_at: Date | null;
  }>(
    `select id, event_name, severity, source, request_id, client_id,
            channel_id, message, metadata, occurred_at, alerted_at, acknowledged_at
     from error_events
     ${where.length ? `where ${where.join(" and ")}` : ""}
     order by occurred_at desc
     limit $${values.length}`,
    values,
  );
  return result.rows.map((row) => ({
    id: row.id,
    eventName: row.event_name,
    severity: row.severity,
    source: row.source,
    requestId: row.request_id,
    clientId: row.client_id,
    channelId: row.channel_id,
    message: row.message,
    metadata: row.metadata,
    occurredAt: row.occurred_at,
    alertedAt: row.alerted_at,
    acknowledgedAt: row.acknowledged_at,
  }));
}

export async function acknowledgeErrorEvent(
  errorEventId: string,
  userId: string,
): Promise<void> {
  await query(
    `update error_events
     set acknowledged_at = now(), acknowledged_by = $2
     where id = $1 and acknowledged_at is null`,
    [errorEventId, userId],
  );
}

async function dispatchExternalAlert(event: ErrorEvent): Promise<void> {
  const webhookUrl = process.env.PRONTO_ERROR_ALERT_WEBHOOK_URL?.trim();
  if (!webhookUrl) return;
  if (event.severity !== "error") return;
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: event.id,
        eventName: event.eventName,
        source: event.source,
        severity: event.severity,
        requestId: event.requestId,
        clientId: event.clientId,
        channelId: event.channelId,
        message: event.message,
        occurredAt: event.occurredAt.toISOString(),
      }),
    });
    if (response.ok) {
      await query(
        `update error_events set alerted_at = now() where id = $1`,
        [event.id],
      );
    } else {
      logWarn("error_tracking.alert_webhook_non_ok", {
        eventId: event.id,
        status: response.status,
      });
    }
  } catch (error) {
    logWarn("error_tracking.alert_webhook_failed", {
      eventId: event.id,
      error,
    });
  }
}

function clampLimit(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 50;
  return Math.min(Math.floor(value), 500);
}
