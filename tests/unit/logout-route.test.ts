import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  logout: vi.fn(),
  recordAuditLog: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getSessionUser: mocks.getSessionUser,
  logout: mocks.logout,
}));

vi.mock("@/lib/audit", () => ({
  recordAuditLog: mocks.recordAuditLog,
}));

import { POST } from "@/app/api/auth/logout/route";

describe("logout route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("audits logout when a session exists", async () => {
    mocks.getSessionUser.mockResolvedValueOnce({
      userId: "user-1",
      clientId: "client-1",
      role: "client",
    });

    const response = await POST(
      new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: {
          host: "localhost",
          origin: "http://localhost",
        },
      }),
    );

    expect(mocks.recordAuditLog).toHaveBeenCalledWith({
      clientId: "client-1",
      actorUserId: "user-1",
      action: "auth.logout",
      targetType: "user",
      targetId: "user-1",
      metadata: { role: "client" },
    });
    expect(mocks.logout).toHaveBeenCalled();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/login");
  });
});
