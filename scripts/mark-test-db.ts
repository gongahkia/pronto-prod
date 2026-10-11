import { Client } from "pg";
import {
  TEST_DATABASE_MARKER,
  TEST_DATABASE_NAME,
  isLocalServerAddress,
  testDatabaseUrl,
} from "./test-db-safety";

async function main(): Promise<void> {
  if (process.env.PRONTO_ALLOW_TEST_DB_MARK !== "1") {
    throw new Error("Explicitly set PRONTO_ALLOW_TEST_DB_MARK=1 for a newly created local test database.");
  }
  const client = new Client({ connectionString: testDatabaseUrl(), connectionTimeoutMillis: 3000 });
  try {
    await client.connect();
    const result = await client.query<{ name: string; address: string | null }>(
      "select current_database() as name, inet_server_addr()::text as address",
    );
    if (
      result.rows[0]?.name !== TEST_DATABASE_NAME ||
      !isLocalServerAddress(result.rows[0]?.address ?? null)
    ) {
      throw new Error("Refusing to mark a database without the expected local identity.");
    }
    await client.query(`comment on database ${TEST_DATABASE_NAME} is '${TEST_DATABASE_MARKER}'`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
