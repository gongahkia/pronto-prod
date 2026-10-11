import net from "node:net";
import { beforeAll, beforeEach, vi } from "vitest";
import { testDatabaseUrl, verifyTestDatabase } from "../../scripts/test-db-safety";

const dbEnabled = process.env.PRONTO_RUN_DB_TESTS === "1";
let allowedDatabase: URL | null = null;
if (dbEnabled) {
  allowedDatabase = new URL(testDatabaseUrl());
} else {
  // An accidental unmocked query must not use the application's local default.
  process.env.DATABASE_URL = "postgres://blocked:blocked@127.0.0.1:1/pronto_test";
}
process.env.PRONTO_USE_MOCK_AI = "1";

const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args: unknown[]) {
  const target = args[0];
  const port =
    typeof target === "number" ? target :
    target && typeof target === "object" && "port" in target ? Number(target.port) : NaN;
  const host =
    typeof target === "number" && typeof args[1] === "string" ? args[1] :
    target && typeof target === "object" && "host" in target ? String(target.host) : "localhost";
  const allowed = allowedDatabase &&
    port === Number(allowedDatabase.port) &&
    ["localhost", "127.0.0.1", "::1"].includes(host);
  if (!allowed) {
    throw new Error(`External network blocked by Pronto test harness: ${host}:${port}`);
  }
  return (originalConnect as (...values: unknown[]) => net.Socket).apply(this, args);
};

const blockedFetch = async () => {
  throw new Error("External fetch blocked by Pronto test harness. Inject a fake fetch explicitly.");
};
vi.stubGlobal("fetch", blockedFetch);
// A test may call vi.unstubAllGlobals(); restore the default before the next test.
beforeEach(() => vi.stubGlobal("fetch", blockedFetch));

beforeAll(async () => {
  if (dbEnabled) await verifyTestDatabase();
});
