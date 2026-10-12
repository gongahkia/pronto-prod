import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), setStaffCapability: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/staff-permissions", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/staff-permissions")>(),
  setStaffCapability: mocks.setStaffCapability,
}));
import { POST } from "@/app/api/client/staff-permissions/route";

describe("business staff permission route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ userId: "manager", clientId: "tenant-a", role: "client" });
  });
  it("rejects an unsigned chat-originated request before any mutation", async () => {
    const response = await POST(new Request("http://localhost/api/client/staff-permissions", {
      method: "POST", body: form(),
    }));
    expect(response.status).toBe(403);
    expect(mocks.setStaffCapability).not.toHaveBeenCalled();
  });
  it("uses the authenticated tenant, never the submitted tenant", async () => {
    const body = form(); body.set("clientId", "tenant-b");
    const response = await POST(new Request("http://localhost/api/client/staff-permissions", {
      method: "POST", headers: { origin: "http://localhost", host: "localhost" }, body,
    }));
    expect(response.status).toBe(303);
    expect(mocks.setStaffCapability).toHaveBeenCalledWith({ actor: expect.objectContaining({ userId: "manager" }),
      clientId: "tenant-a", userId: "staff", capability: "knowledge.approve", granted: true,
      evidence: "Owner delegation" });
  });
  it("fails closed if the staff manager capability is absent", async () => {
    mocks.setStaffCapability.mockRejectedValueOnce(new Error("Permission staff.permissions.manage is required."));
    const response = await POST(new Request("http://localhost/api/client/staff-permissions", {
      method: "POST", headers: { origin: "http://localhost", host: "localhost" }, body: form(),
    }));
    expect(response.status).toBe(403);
  });
});

function form() {
  const body = new FormData();
  body.set("userId", "staff"); body.set("capability", "knowledge.approve");
  body.set("action", "grant"); body.set("evidence", "Owner delegation");
  return body;
}
