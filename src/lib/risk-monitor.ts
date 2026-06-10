import { createHash } from "node:crypto";
import { query } from "@/lib/db";
import { logError, logInfo, logWarn, redactErrorMessage } from "@/lib/logger";

export type RiskMonitorKind = "pricing" | "policy";
export type RiskMonitorFindingKind = "changed" | "unreachable" | "overdue";

export type RiskMonitorSource = {
  id: string;
  kind: RiskMonitorKind;
  label: string;
  url: string;
  cadenceDays: number;
  isActive: boolean;
};

export type RiskMonitorSnapshot = {
  id: string;
  sourceId: string;
  fetchedAt: Date;
  statusCode: number | null;
  contentHash: string | null;
  contentLength: number;
  excerpt: string | null;
  fetchError: string | null;
};

export type RiskMonitorFinding = {
  id: string;
  sourceId: string;
  findingKind: RiskMonitorFindingKind;
  detectedAt: Date;
  previousSnapshotId: string | null;
  currentSnapshotId: string | null;
  summary: string;
  acknowledgedAt: Date | null;
};

export type RiskMonitorRunResult = {
  kind: RiskMonitorKind;
  checked: number;
  changed: number;
  unreachable: number;
  overdue: number;
  findings: RiskMonitorFinding[];
};

const EXCERPT_MAX_CHARS = 2000;
const FETCH_TIMEOUT_MS = 15_000;
const OVERDUE_GRACE_DAYS = 1;

type Fetcher = (url: string) => Promise<{ status: number; body: string }>;

const defaultFetcher: Fetcher = async (url) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "user-agent": "PrintoRiskMonitor/1.0" },
      signal: controller.signal,
    });
    const body = await response.text();
    return { status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
};

export async function listRiskMonitorSources(
  kind?: RiskMonitorKind,
): Promise<RiskMonitorSource[]> {
  const result = await query<{
    id: string;
    kind: RiskMonitorKind;
    label: string;
    url: string;
    cadence_days: number;
    is_active: boolean;
  }>(
    `select id, kind, label, url, cadence_days, is_active
     from risk_monitor_sources
     where is_active = true ${kind ? "and kind = $1" : ""}
     order by id asc`,
    kind ? [kind] : [],
  );
  return result.rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    label: row.label,
    url: row.url,
    cadenceDays: row.cadence_days,
    isActive: row.is_active,
  }));
}

export async function runRiskMonitor(
  kind: RiskMonitorKind,
  options: { fetcher?: Fetcher; now?: Date } = {},
): Promise<RiskMonitorRunResult> {
  const fetcher = options.fetcher ?? defaultFetcher;
  const now = options.now ?? new Date();
  const sources = await listRiskMonitorSources(kind);
  const findings: RiskMonitorFinding[] = [];
  let changed = 0;
  let unreachable = 0;
  let overdue = 0;

  for (const source of sources) {
    const previous = await getLatestSnapshot(source.id);
    let snapshot: RiskMonitorSnapshot;

    try {
      const { status, body } = await fetcher(source.url);
      const hash = createHash("sha256").update(body).digest("hex");
      snapshot = await insertSnapshot({
        sourceId: source.id,
        statusCode: status,
        contentHash: status >= 200 && status < 300 ? hash : null,
        contentLength: body.length,
        excerpt: body.slice(0, EXCERPT_MAX_CHARS),
        fetchError: status >= 200 && status < 300 ? null : `HTTP ${status}`,
      });

      if (status < 200 || status >= 300) {
        unreachable += 1;
        findings.push(
          await insertFinding({
            sourceId: source.id,
            findingKind: "unreachable",
            previousSnapshotId: previous?.id ?? null,
            currentSnapshotId: snapshot.id,
            summary: `Non-2xx response (status ${status}) when fetching ${source.label}.`,
          }),
        );
        continue;
      }

      if (previous?.contentHash && previous.contentHash !== hash) {
        changed += 1;
        findings.push(
          await insertFinding({
            sourceId: source.id,
            findingKind: "changed",
            previousSnapshotId: previous.id,
            currentSnapshotId: snapshot.id,
            summary: `Content hash changed for ${source.label}. Compare snapshots ${previous.id} and ${snapshot.id}.`,
          }),
        );
      }
    } catch (error) {
      const message = redactErrorMessage(error);
      snapshot = await insertSnapshot({
        sourceId: source.id,
        statusCode: null,
        contentHash: null,
        contentLength: 0,
        excerpt: null,
        fetchError: message,
      });
      unreachable += 1;
      findings.push(
        await insertFinding({
          sourceId: source.id,
          findingKind: "unreachable",
          previousSnapshotId: previous?.id ?? null,
          currentSnapshotId: snapshot.id,
          summary: `Fetch failed for ${source.label}: ${message}`,
        }),
      );
      logError("risk_monitor.fetch_failed", {
        sourceId: source.id,
        error: message,
      });
    }

    if (previous) {
      const ageDays =
        (now.getTime() - previous.fetchedAt.getTime()) / (24 * 60 * 60 * 1000);
      if (ageDays > source.cadenceDays + OVERDUE_GRACE_DAYS) {
        overdue += 1;
        findings.push(
          await insertFinding({
            sourceId: source.id,
            findingKind: "overdue",
            previousSnapshotId: previous.id,
            currentSnapshotId: snapshot.id,
            summary: `Previous review for ${source.label} was ${ageDays.toFixed(1)} days ago, exceeding cadence ${source.cadenceDays}.`,
          }),
        );
      }
    }
  }

  logInfo("risk_monitor.run_completed", {
    kind,
    checked: sources.length,
    changed,
    unreachable,
    overdue,
  });

  await emitExternalAlerts(kind, findings);

  return { kind, checked: sources.length, changed, unreachable, overdue, findings };
}

export async function getLatestSnapshot(
  sourceId: string,
): Promise<RiskMonitorSnapshot | null> {
  const result = await query<{
    id: string;
    source_id: string;
    fetched_at: Date;
    status_code: number | null;
    content_hash: string | null;
    content_length: number;
    excerpt: string | null;
    fetch_error: string | null;
  }>(
    `select id, source_id, fetched_at, status_code, content_hash, content_length, excerpt, fetch_error
     from risk_monitor_snapshots
     where source_id = $1
     order by fetched_at desc
     limit 1`,
    [sourceId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    sourceId: row.source_id,
    fetchedAt: row.fetched_at,
    statusCode: row.status_code,
    contentHash: row.content_hash,
    contentLength: row.content_length,
    excerpt: row.excerpt,
    fetchError: row.fetch_error,
  };
}

export async function listOpenFindings(
  kind?: RiskMonitorKind,
): Promise<RiskMonitorFinding[]> {
  const result = await query<{
    id: string;
    source_id: string;
    finding_kind: RiskMonitorFindingKind;
    detected_at: Date;
    previous_snapshot_id: string | null;
    current_snapshot_id: string | null;
    summary: string;
    acknowledged_at: Date | null;
  }>(
    `select f.id, f.source_id, f.finding_kind, f.detected_at,
            f.previous_snapshot_id, f.current_snapshot_id, f.summary, f.acknowledged_at
     from risk_monitor_findings f
     join risk_monitor_sources s on s.id = f.source_id
     where f.acknowledged_at is null ${kind ? "and s.kind = $1" : ""}
     order by f.detected_at desc`,
    kind ? [kind] : [],
  );
  return result.rows.map(mapFinding);
}

async function insertSnapshot(input: {
  sourceId: string;
  statusCode: number | null;
  contentHash: string | null;
  contentLength: number;
  excerpt: string | null;
  fetchError: string | null;
}): Promise<RiskMonitorSnapshot> {
  const result = await query<{
    id: string;
    source_id: string;
    fetched_at: Date;
    status_code: number | null;
    content_hash: string | null;
    content_length: number;
    excerpt: string | null;
    fetch_error: string | null;
  }>(
    `insert into risk_monitor_snapshots
       (source_id, status_code, content_hash, content_length, excerpt, fetch_error)
     values ($1, $2, $3, $4, $5, $6)
     returning id, source_id, fetched_at, status_code, content_hash, content_length, excerpt, fetch_error`,
    [
      input.sourceId,
      input.statusCode,
      input.contentHash,
      input.contentLength,
      input.excerpt,
      input.fetchError,
    ],
  );
  const row = result.rows[0];
  return {
    id: row.id,
    sourceId: row.source_id,
    fetchedAt: row.fetched_at,
    statusCode: row.status_code,
    contentHash: row.content_hash,
    contentLength: row.content_length,
    excerpt: row.excerpt,
    fetchError: row.fetch_error,
  };
}

async function insertFinding(input: {
  sourceId: string;
  findingKind: RiskMonitorFindingKind;
  previousSnapshotId: string | null;
  currentSnapshotId: string | null;
  summary: string;
}): Promise<RiskMonitorFinding> {
  const result = await query<{
    id: string;
    source_id: string;
    finding_kind: RiskMonitorFindingKind;
    detected_at: Date;
    previous_snapshot_id: string | null;
    current_snapshot_id: string | null;
    summary: string;
    acknowledged_at: Date | null;
  }>(
    `insert into risk_monitor_findings
       (source_id, finding_kind, previous_snapshot_id, current_snapshot_id, summary)
     values ($1, $2, $3, $4, $5)
     returning id, source_id, finding_kind, detected_at,
               previous_snapshot_id, current_snapshot_id, summary, acknowledged_at`,
    [
      input.sourceId,
      input.findingKind,
      input.previousSnapshotId,
      input.currentSnapshotId,
      input.summary,
    ],
  );
  return mapFinding(result.rows[0]);
}

function mapFinding(row: {
  id: string;
  source_id: string;
  finding_kind: RiskMonitorFindingKind;
  detected_at: Date;
  previous_snapshot_id: string | null;
  current_snapshot_id: string | null;
  summary: string;
  acknowledged_at: Date | null;
}): RiskMonitorFinding {
  return {
    id: row.id,
    sourceId: row.source_id,
    findingKind: row.finding_kind,
    detectedAt: row.detected_at,
    previousSnapshotId: row.previous_snapshot_id,
    currentSnapshotId: row.current_snapshot_id,
    summary: row.summary,
    acknowledgedAt: row.acknowledged_at,
  };
}

async function emitExternalAlerts(
  kind: RiskMonitorKind,
  findings: RiskMonitorFinding[],
): Promise<void> {
  if (findings.length === 0) return;
  const webhookUrl = process.env.PRONTO_RISK_ALERT_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    logWarn("risk_monitor.alerts_recorded_without_webhook", {
      kind,
      count: findings.length,
    });
    return;
  }
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind,
        detectedAt: new Date().toISOString(),
        findings: findings.map((f) => ({
          id: f.id,
          sourceId: f.sourceId,
          kind: f.findingKind,
          summary: f.summary,
        })),
      }),
    });
    if (!response.ok) {
      logWarn("risk_monitor.alert_webhook_non_ok", {
        kind,
        status: response.status,
      });
    }
  } catch (error) {
    logError("risk_monitor.alert_webhook_failed", {
      kind,
      error: redactErrorMessage(error),
    });
  }
}

export async function acknowledgeFinding(
  findingId: string,
  userId: string,
): Promise<void> {
  await query(
    `update risk_monitor_findings
     set acknowledged_at = now(), acknowledged_by = $2
     where id = $1 and acknowledged_at is null`,
    [findingId, userId],
  );
}
