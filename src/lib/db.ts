import { Pool, type QueryResult, type QueryResultRow } from "pg";
import { databaseUrl } from "@/lib/env";

type GlobalWithPool = typeof globalThis & {
  prontoPool?: Pool;
};

const globalForPool = globalThis as GlobalWithPool;

export function getPool(): Pool {
  if (!globalForPool.prontoPool) {
    globalForPool.prontoPool = new Pool({
      connectionString: databaseUrl(),
      max: 10,
    });
  }

  return globalForPool.prontoPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, values);
}

export async function transaction<T>(
  callback: (client: Pick<Pool, "query">) => Promise<T>,
): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");
    const result = await callback(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export function vectorLiteral(values: readonly number[]): string {
  return `[${values.map((value) => Number(value).toFixed(8)).join(",")}]`;
}
