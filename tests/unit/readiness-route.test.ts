import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  query: (...args: unknown[]) => mocks.poolQuery(...args),
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

  describe("protected Groq demo prerequisites", () => {
    beforeEach(() => {
      const env = {
        PRONTO_DEPLOYMENT_PROFILE: "protected-demo", PRONTO_DEMO_PROCESSING_MODE: "request",
        PRONTO_CUSTOMER_DEMO_ENABLED: "1", PRONTO_DEMO_ONLY_DELIVERY: "1",
        PRONTO_CHOPE_LIVE_READS: "0", CHOPE_LIVE_READ_APPROVED: "0", PRONTO_TEST_DATABASE_URL: "",
        PRONTO_DEMO_DATABASE_ID: "00000000-0000-4000-8000-00000000d001",
        PRONTO_DEMO_ALLOWED_USER_IDS: "00000000-0000-4000-8000-00000000d002",
        DATABASE_URL: "postgresql://demo:synthetic@database.invalid/pronto_demo?sslmode=verify-full",
        GROQ_API_KEY: "synthetic-not-live", PRONTO_DEMO_REAL_AI_APPROVED: "1",
        PRONTO_GROQ_FREE_TIER_CONFIRMED: "1", OPENAI_API_KEY: "", GEMINI_API_KEY: "",
        AZURE_OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "",
      };
      for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
      mocks.poolQuery.mockImplementation(async (sql: string) => {
        if (sql.includes("shobj_description")) return { rows: [{ safe: true }] };
        if (sql.includes("select * from agent_configs")) return { rows: [{ response_provider: "openai", embedding_provider: "openai" }] };
        if (sql.includes("as ready")) return { rows: [{ ready: true }] };
        if (sql.includes("from (select 1) present")) return { rows: [{ stopped: 0 }] };
        return { rows: sql.includes("worker_heartbeats") ? [{ updated_at: new Date() }] : [{ "?column?": 1 }] };
      });
    });

    it.each(["request", "worker"])("checks real-model configuration and published knowledge in %s mode without provider calls", async mode => {
      vi.stubEnv("PRONTO_DEMO_PROCESSING_MODE", mode);
      const providerFetch = vi.fn();
      vi.stubGlobal("fetch", providerFetch);
      try {
        const response = await GET();
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ status: "ready" });
        expect(mocks.poolQuery.mock.calls.some(([sql]) => sql.includes("as ready"))).toBe(true);
        expect(providerFetch).not.toHaveBeenCalled();
      } finally { vi.unstubAllGlobals(); }
    });

    it.each([
      ["GROQ_API_KEY", ""], ["PRONTO_DEMO_REAL_AI_APPROVED", "0"],
      ["PRONTO_GROQ_FREE_TIER_CONFIRMED", "0"], ["PRONTO_USE_MOCK_AI", "1"],
    ])("fails closed for missing or unsafe %s", async (key, value) => {
      vi.stubEnv(key, value);
      const response = await GET();
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ status: "not_ready" });
    });

    it.each(["knowledge", "tenant configuration"])("fails when %s is absent despite a reachable database", async missing => {
      const original = mocks.poolQuery.getMockImplementation()!;
      mocks.poolQuery.mockImplementation(async (sql: string) => {
        if (missing === "knowledge" && sql.includes("as ready")) return { rows: [{ ready: false }] };
        if (missing === "tenant configuration" && sql.includes("select * from agent_configs")) return { rows: [] };
        return original(sql);
      });
      const response = await GET();
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ status: "not_ready" });
    });

    it("does not inspect model configuration after demo identity verification fails", async () => {
      const original = mocks.poolQuery.getMockImplementation()!;
      mocks.poolQuery.mockImplementation(async (sql: string) => sql.includes("shobj_description")
        ? { rows: [{ safe: false }] } : original(sql));
      expect((await GET()).status).toBe(503);
      expect(mocks.poolQuery.mock.calls.some(([sql]) => sql.includes("select * from agent_configs"))).toBe(false);
    });
  });
});
