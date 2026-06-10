import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  getRateLimitStatus: vi.fn(),
  recordRateLimitHit: vi.fn(),
  resetRateLimit: vi.fn(),
  recordAuditLog: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  login: mocks.login,
}));

vi.mock("@/lib/http-limits", () => ({
  getRateLimitStatus: mocks.getRateLimitStatus,
  recordRateLimitHit: mocks.recordRateLimitHit,
  resetRateLimit: mocks.resetRateLimit,
}));

vi.mock("@/lib/audit", () => ({
  recordAuditLog: mocks.recordAuditLog,
}));

import { POST } from "@/app/api/auth/login/route";

describe("login route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRateLimitStatus.mockResolvedValue({
      allowed: true,
      remaining: 5,
      retryAfterSeconds: 0,
    });
    mocks.recordRateLimitHit.mockResolvedValue({
      allowed: true,
      remaining: 4,
      retryAfterSeconds: 0,
    });
    mocks.resetRateLimit.mockResolvedValue(undefined);
  });

  it("rate limits repeated failed login attempts before checking credentials", async () => {
    mocks.getRateLimitStatus.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 120,
    });

    const form = new FormData();
    form.set("email", " Owner@Example.com ");
    form.set("password", "bad-password");

    const response = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "x-forwarded-for": "203.0.113.25, 10.0.0.1" },
        body: form,
      }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("120");
    expect(mocks.getRateLimitStatus).toHaveBeenCalledWith(
      "auth:login:owner@example.com:203.0.113.0/24",
      5,
      900000,
    );
    expect(mocks.login).not.toHaveBeenCalled();
    expect(mocks.recordAuditLog).toHaveBeenCalledWith({
      clientId: null,
      actorUserId: null,
      action: "auth.login_rate_limited",
      targetType: "user",
      metadata: {
        email: "owner@example.com",
        ipKey: "203.0.113.0/24",
        retryAfterSeconds: 120,
      },
    });
  });

  it("keeps invalid credential responses generic", async () => {
    mocks.login.mockResolvedValueOnce(null);

    const form = new FormData();
    form.set("email", "owner@example.com");
    form.set("password", "bad-password");

    const response = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        body: form,
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/login?error=1");
    expect(mocks.recordRateLimitHit).toHaveBeenCalledWith(
      "auth:login:owner@example.com:local",
      5,
      900000,
    );
    expect(mocks.resetRateLimit).not.toHaveBeenCalled();
  });

  it("does not consume the failed-login budget on successful login", async () => {
    mocks.login.mockResolvedValueOnce({
      userId: "user-1",
      email: "owner@example.com",
      name: "Owner",
      role: "client",
      clientId: "client-1",
    });

    const form = new FormData();
    form.set("email", "owner@example.com");
    form.set("password", "correct-password");

    const response = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        body: form,
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/client");
    expect(mocks.recordRateLimitHit).not.toHaveBeenCalled();
    expect(mocks.resetRateLimit).toHaveBeenCalledWith(
      "auth:login:owner@example.com:local",
    );
  });
});
