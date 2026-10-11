import net from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { testDatabaseUrl } from "../../scripts/test-db-safety";

describe("test harness safety", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("blocks an unmocked paid-provider fetch", async () => {
    await expect(fetch("https://api.openai.com/v1/responses")).rejects.toThrow(
      "External fetch blocked",
    );
  });

  it("blocks direct external sockets", () => {
    expect(() => net.connect(443, "api.openai.com")).toThrow("External network blocked");
  });

  it("rejects a staging-like URL even when marked as a test URL", () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@db.example.com:5432/pronto_test");
    vi.stubEnv("PRONTO_TEST_DATABASE_URL", "postgres://user:pass@db.example.com:5432/pronto_test");
    expect(() => testDatabaseUrl()).toThrow("loopback TCP port");
  });

  it("rejects a mismatched application database URL", () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@127.0.0.1:5432/pronto");
    vi.stubEnv("PRONTO_TEST_DATABASE_URL", "postgres://user:pass@127.0.0.1:5432/pronto_test");
    expect(() => testDatabaseUrl()).toThrow("same explicit isolated test URL");
  });
});
