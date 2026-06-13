import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  query: vi.fn(),
  verifyPassword: vi.fn(),
  recordAuditLog: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));

vi.mock("@/lib/db", () => ({
  query: mocks.query,
}));

vi.mock("@/lib/password", () => ({
  verifyPassword: mocks.verifyPassword,
}));

vi.mock("@/lib/audit", () => ({
  recordAuditLog: mocks.recordAuditLog,
}));

import { login } from "@/lib/auth";

describe("auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookies.mockResolvedValue({
      set: vi.fn(),
      delete: vi.fn(),
      get: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails closed when production uses the local default auth secret", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "local-dev-secret-change-me");
    mocks.query.mockResolvedValueOnce({ rows: [userRecord()] });
    mocks.verifyPassword.mockResolvedValueOnce(true);

    await expect(login("owner@example.com", "password")).rejects.toThrow(
      "AUTH_SECRET must be set",
    );
    expect(mocks.recordAuditLog).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "auth.login_succeeded" }),
    );
  });

  it("audits login failures for unknown users", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });

    const result = await login("missing@example.com", "password");

    expect(result).toBeNull();
    expect(mocks.recordAuditLog).toHaveBeenCalledWith({
      clientId: null,
      actorUserId: null,
      action: "auth.login_failed",
      targetType: "user",
      metadata: {
        email: "missing@example.com",
        reason: "user_not_found",
      },
    });
  });
});

function userRecord() {
  return {
    id: "user-1",
    client_id: "client-1",
    email: "owner@example.com",
    name: "Owner",
    role: "client",
    password_hash: "hash",
    session_version: 1,
    created_at: new Date(),
  };
}
