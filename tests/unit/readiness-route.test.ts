import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getPool: () => ({
    query: mocks.poolQuery,
  }),
}));

import { GET } from "@/app/api/readiness/route";

describe("readiness route", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "ci-auth-secret-with-more-than-32-characters");
    vi.stubEnv("PRONTO_SECRETS_KEY", "ci-secrets-key-with-more-than-32-characters");
    vi.stubEnv("APP_BASE_URL", "https://staging.example.com");
    vi.stubEnv("PRONTO_USE_MOCK_AI", "0");
    vi.stubEnv("PRONTO_DISABLE_TENANT_SQL_GATE", "0");
    mocks.poolQuery.mockImplementation(async (sql: string) => ({ rows: sql.includes("worker_heartbeats")
      ? [{ updated_at: new Date() }] : [{ "?column?": 1 }] }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("returns ready when production secrets, HTTPS base URL, AI, tenant gate, and DB pass", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body.status).toBe("ready");
    expect(body).toEqual({ status: "ready" });
    expect(mocks.poolQuery).toHaveBeenCalledWith("select 1");
  });

  it("fails production readiness for weak secrets, HTTP base URL, and mock AI", async () => {
    vi.stubEnv("AUTH_SECRET", "replace-with-auth-secret");
    vi.stubEnv("PRONTO_SECRETS_KEY", "short");
    vi.stubEnv("APP_BASE_URL", "http://staging.example.com");
    vi.stubEnv("PRONTO_USE_MOCK_AI", "1");

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("not_ready");
    expect(body).toEqual({ status: "not_ready" });
  });

  it("fails production readiness when tenant SQL gate is disabled", async () => {
    vi.stubEnv("PRONTO_DISABLE_TENANT_SQL_GATE", "1");

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ status: "not_ready" });
  });

  it("fails readiness when the database is unreachable", async () => {
    mocks.poolQuery.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ status: "not_ready" });
  });

  it("fails readiness when the worker has stopped heartbeating", async () => {
    mocks.poolQuery.mockImplementation(async (sql: string) => ({ rows: sql.includes("worker_heartbeats")
      ? [{ updated_at: new Date(Date.now() - 120_000) }] : [{ "?column?": 1 }] }));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "not_ready" });
  });
});
