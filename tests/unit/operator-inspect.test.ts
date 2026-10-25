import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), clients: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSessionUser: mocks.actor }));
vi.mock("@/lib/dashboard", () => ({ getClients: mocks.clients, getClient: vi.fn(), getChannels: vi.fn(), getKnowledgeSources: vi.fn(), getConversationTriageDetail: vi.fn(), getConversationMessages: vi.fn(), getConversationActionableEscalation: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
import { GET } from "@/app/api/operator/inspect/route";
beforeEach(() => { vi.clearAllMocks(); });
describe("headless administration access", () => {
  it("rejects anonymous inspection before reading any business data", async () => {
    mocks.actor.mockResolvedValue(null);
    expect((await GET(new Request("http://localhost/api/operator/inspect"))).status).toBe(401);
    expect(mocks.clients).not.toHaveBeenCalled(); expect(mocks.query).not.toHaveBeenCalled();
  });
  it("rejects a business account even when it supplies another tenant ID", async () => {
    mocks.actor.mockResolvedValue({ role: "client", clientId: "tenant-a" });
    expect((await GET(new Request("http://localhost/api/operator/inspect?clientId=tenant-b"))).status).toBe(403);
    expect(mocks.clients).not.toHaveBeenCalled(); expect(mocks.query).not.toHaveBeenCalled();
  });
  it("allows an operator and prevents browser caching of administrative data", async () => {
    mocks.actor.mockResolvedValue({ role: "operator", userId: "operator", clientId: null });
    mocks.clients.mockResolvedValue([{ id: "tenant-a", name: "Synthetic restaurant" }]);
    const response = await GET(new Request("http://localhost/api/operator/inspect?view=clients"));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toMatchObject({ clients: [{ id: "tenant-a" }] });
  });
});
