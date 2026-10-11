import { Client } from "pg";

export const TEST_DATABASE_NAME = "pronto_test";
export const TEST_DATABASE_MARKER = "pronto:isolated-test-database:v1";

export function isLocalServerAddress(address: string | null): boolean {
  if (!address) return false;
  const ip = address.replace(/\/\d+$/, "");
  if (["127.0.0.1", "::1"].includes(ip)) return true;
  // Docker port forwarding reaches the container over its private bridge.
  const parts = ip.split(".").map(Number);
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) &&
    (parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168));
}

export function testDatabaseUrl(): string {
  const raw = process.env.PRONTO_TEST_DATABASE_URL;
  if (!raw || process.env.DATABASE_URL !== raw) {
    throw new Error("Set DATABASE_URL and PRONTO_TEST_DATABASE_URL to the same explicit isolated test URL.");
  }
  const url = new URL(raw);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost", "::1"].includes(url.hostname) ||
    url.pathname !== `/${TEST_DATABASE_NAME}` ||
    !url.port
  ) {
    throw new Error("The test database must be pronto_test on an explicit loopback TCP port.");
  }
  return raw;
}

export async function verifyTestDatabase(): Promise<void> {
  const connectionString = testDatabaseUrl();
  const client = new Client({ connectionString, connectionTimeoutMillis: 3000 });
  try {
    await client.connect();
    const result = await client.query<{
      database_name: string;
      server_address: string | null;
      marker: string | null;
    }>(
      `select current_database() as database_name,
              inet_server_addr()::text as server_address,
              shobj_description(oid, 'pg_database') as marker
       from pg_database where datname = current_database()`,
    );
    const row = result.rows[0];
    if (
      row?.database_name !== TEST_DATABASE_NAME ||
      !isLocalServerAddress(row.server_address) ||
      row.marker !== TEST_DATABASE_MARKER
    ) {
      throw new Error("Database identity or isolation marker did not match the dedicated local test database.");
    }
  } finally {
    await client.end();
  }
}
