import { Pool, type QueryResult, type QueryResultRow } from "pg";
import { databaseUrl } from "@/lib/env";
import { logWarn } from "@/lib/logger";
import { getTenantContext } from "@/lib/tenant-context";

type GlobalWithPool = typeof globalThis & {
  prontoPool?: Pool;
};

export type Queryable = {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>>;
};

const globalForPool = globalThis as GlobalWithPool;

export function getPool(): Pool {
  if (!globalForPool.prontoPool) {
    globalForPool.prontoPool = new Pool({
      connectionString: databaseUrl(),
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 30_000,
      query_timeout: 35_000,
      idle_in_transaction_session_timeout: 30_000,
    });
  }

  return globalForPool.prontoPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<QueryResult<T>> {
  assertTenantScopedQuery(text, values);
  return getPool().query<T>(text, values);
}

export async function transaction<T>(
  callback: (client: Queryable) => Promise<T>,
  options: {
    isolationLevel?: "read committed" | "repeatable read" | "serializable";
    retries?: number;
    leakWarningMs?: number;
  } = {},
): Promise<T> {
  const retries = options.retries ?? 0;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await runTransaction(callback, options);
    } catch (error) {
      if (attempt >= retries || !isSerializationFailure(error)) {
        throw error;
      }
      logWarn("db.transaction_retry", { attempt: attempt + 1, error });
    }
  }
}

async function runTransaction<T>(
  callback: (client: Queryable) => Promise<T>,
  options: {
    isolationLevel?: "read committed" | "repeatable read" | "serializable";
    leakWarningMs?: number;
  },
): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  const startedAt = Date.now();
  const leakWarningMs = options.leakWarningMs ?? 30_000;
  const timer = setTimeout(() => {
    logWarn("db.transaction_held_too_long", {
      heldMs: Date.now() - startedAt,
      isolationLevel: options.isolationLevel ?? "read committed",
    });
  }, leakWarningMs);
  timer.unref?.();

  try {
    await client.query(beginStatement(options.isolationLevel));
    const guardedClient: Queryable = {
      query: <T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) => {
        assertTenantScopedQuery(text, values ?? []);
        return client.query<T>(text, values);
      },
    };
    const result = await callback(guardedClient);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    clearTimeout(timer);
    client.release();
  }
}

function beginStatement(
  isolationLevel: "read committed" | "repeatable read" | "serializable" | undefined,
): string {
  if (!isolationLevel || isolationLevel === "read committed") {
    return "begin";
  }
  return `begin isolation level ${isolationLevel}`;
}

function isSerializationFailure(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "40001",
  );
}

export function vectorLiteral(values: readonly number[]): string {
  return `[${values.map((value) => Number(value).toFixed(8)).join(",")}]`;
}

function assertTenantScopedQuery(text: string, values: unknown[]): void {
  if (!tenantSqlGateEnabled()) return;
  const context = getTenantContext();
  if (context?.role !== "client") return;
  const normalized = text.toLowerCase().replace(/\s+/g, " ");
  if (!mentionsClientScopedTable(normalized)) return;
  if (/\bclient_id\b/.test(normalized) && context.clientId && values.includes(context.clientId)) {
    return;
  }
  throw new Error("Client-scoped query must include client_id.");
}

function tenantSqlGateEnabled(): boolean {
  if (process.env.PRONTO_DISABLE_TENANT_SQL_GATE === "1") return false;
  return process.env.PRONTO_ENFORCE_TENANT_SQL === "1" || process.env.NODE_ENV === "production";
}

function mentionsClientScopedTable(sql: string): boolean {
  return /\b(from|join|update|into|delete from)\s+(messages|conversations|escalations|reviews|channels|knowledge_sources|knowledge_chunks|agent_configs|agent_usage_events|agent_traces|audit_logs|metric_events|brand_voice_documents|brand_voice_examples|csat_responses|outbound_messages|integration_credentials|knowledge_refresh_requests|client_assistant_change_requests)\b/.test(sql);
}
