import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  recordAuditLog: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  login: mocks.login,
}));

vi.mock("@/lib/audit", () => ({
  recordAuditLog: mocks.recordAuditLog,
}));

import { POST } from "@/app/api/auth/login/route";

describe("login route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps invalid credential responses generic", async () => {
    mocks.login.mockResolvedValueOnce(null);

    const form = new FormData();
    form.set("email", "owner@example.com");
    form.set("password", "bad-password");

    const response = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: {
          host: "localhost",
          origin: "http://localhost",
        },
        body: form,
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/login?error=1");
    expect(mocks.login).toHaveBeenCalledWith("owner@example.com", "bad-password");
  });

  it("redirects successful logins to the role landing page", async () => {
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
        headers: {
          host: "localhost",
          origin: "http://localhost",
        },
        body: form,
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/client");
  });
});
