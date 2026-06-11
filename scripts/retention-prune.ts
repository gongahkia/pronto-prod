import { getPool } from "../src/lib/db";

const defaults = {
  closedConversationMessageDays: 365,
  auditLogDays: 365,
  errorEventDays: 90,
  agentTraceDays: 365,
  agentUsageDays: 365,
};

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const results = {
      messages: await prune(
        client,
        `
          delete from messages m
          using conversations c
          where m.conversation_id = c.id
            and c.status = 'closed'
            and m.created_at < now() - make_interval(days => $1::int)
        `,
        envDays("PRONTO_RETENTION_CLOSED_MESSAGE_DAYS", defaults.closedConversationMessageDays),
      ),
      auditLogs: await prune(
        client,
        "delete from audit_logs where created_at < now() - make_interval(days => $1::int)",
        envDays("PRONTO_RETENTION_AUDIT_LOG_DAYS", defaults.auditLogDays),
      ),
      errorEvents: await prune(
        client,
        "delete from error_events where occurred_at < now() - make_interval(days => $1::int)",
        envDays("PRONTO_RETENTION_ERROR_EVENT_DAYS", defaults.errorEventDays),
      ),
      agentTraces: await prune(
        client,
        "delete from agent_traces where created_at < now() - make_interval(days => $1::int)",
        envDays("PRONTO_RETENTION_AGENT_TRACE_DAYS", defaults.agentTraceDays),
      ),
      agentUsageEvents: await prune(
        client,
        "delete from agent_usage_events where created_at < now() - make_interval(days => $1::int)",
        envDays("PRONTO_RETENTION_AGENT_USAGE_DAYS", defaults.agentUsageDays),
      ),
    };
    if (dryRun) {
      await client.query("rollback");
    } else {
      await client.query("commit");
    }
    console.log(JSON.stringify({ dryRun, ...results }, null, 2));
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function prune(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rowCount: number | null }> },
  sql: string,
  days: number,
): Promise<number> {
  const result = await client.query(sql, [days]);
  return result.rowCount ?? 0;
}

function envDays(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

