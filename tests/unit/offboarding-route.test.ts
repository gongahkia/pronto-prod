import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  buildClientOffboardingExport: vi.fn(),
  deleteClientForOffboarding: vi.fn(),
  recordAuditLog: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireUser: mocks.requireUser,
}));

vi.mock("@/lib/offboarding", () => ({
  buildClientOffboardingExport: mocks.buildClientOffboardingExport,
  deleteClientForOffboarding: mocks.deleteClientForOffboarding,
}));

vi.mock("@/lib/audit", () => ({
  recordAuditLog: mocks.recordAuditLog,
}));

import { POST } from "@/app/api/operator/offboarding/route";

describe("operator offboarding route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({
      userId: "operator-1",
      role: "operator",
      clientId: null,
    });
  });

  it("audits client data exports", async () => {
    mocks.buildClientOffboardingExport.mockResolvedValueOnce({
      exportedAt: "2026-06-04T00:00:00.000Z",
      client: { id: "client-1", slug: "north-bridge-nasi" },
      channels: [],
      knowledgeSources: [],
      conversations: [],
      escalations: [],
      agentConfig: null,
    });
    const form = new FormData();
    form.set("action", "export");
    form.set("clientId", "client-1");

    const response = await POST(
      new Request("http://localhost/api/operator/offboarding", {
        method: "POST",
        headers: {
          host: "localhost",
          origin: "http://localhost",
        },
        body: form,
      }),
    );

    expect(mocks.recordAuditLog).toHaveBeenCalledWith({
      clientId: "client-1",
      actorUserId: "operator-1",
      action: "client.offboarding_exported",
      targetType: "client",
      targetId: "client-1",
      metadata: {
        slug: "north-bridge-nasi",
        exportedAt: "2026-06-04T00:00:00.000Z",
      },
    });
    expect(response.headers.get("content-disposition")).toContain(
      "north-bridge-nasi-offboarding-export.json",
    );
  });
});
