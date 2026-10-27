import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), protectedProfile: vi.fn(), config: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: mocks.query, transaction: vi.fn() }));
vi.mock("@/lib/deployment-profile", () => ({ protectedDemoDeployment: mocks.protectedProfile, protectedDemoConfiguration: mocks.config, requestDrivenDemoProcessing: () => false }));
vi.mock("@/lib/customer-demo-boundary", async (original) => ({ ...(await original<typeof import("@/lib/customer-demo-boundary")>()), assertCustomerDemoEnabled: vi.fn() }));
vi.mock("@/lib/channels/inbox", () => ({ ingestInboundMessage: vi.fn() }));
vi.mock("@/lib/customer-demo-ai", () => ({}));
vi.mock("@/lib/audit", () => ({ recordAuditLog: vi.fn() }));
import { assertDemoActor } from "@/lib/customer-demo";
import { DEMO_CLIENT_ID } from "@/lib/customer-demo-boundary";
const actor = (email: string, userId = "00000000-0000-4000-8000-0000000000aa") => ({ userId, email, name: "Keith", role: "client" as const, clientId: DEMO_CLIENT_ID });
beforeEach(() => { vi.clearAllMocks(); mocks.protectedProfile.mockReturnValue(true); mocks.config.mockReturnValue({ allowedUserIds: ["00000000-0000-4000-8000-0000000000ff"] }); mocks.query.mockResolvedValue({ rows: [{ id: DEMO_CLIENT_ID }] }); });
afterEach(() => vi.unstubAllEnvs());
describe("protected demo actor check with guest reviewers", () => {
  it("rejects a user who is not on the named list when guest access is off", async () => {
    await expect(assertDemoActor(actor("guest-1@guest.invalid"))).rejects.toMatchObject({ status: 403 });
  });
  it("admits a guest only when guest access is enabled, and still requires the demo-tenant identity", async () => {
    vi.stubEnv("PRONTO_DEMO_GUEST_ACCESS", "1");
    await expect(assertDemoActor(actor("guest-1@guest.invalid"))).resolves.toBeUndefined();
    mocks.query.mockResolvedValue({ rows: [] });
    await expect(assertDemoActor(actor("guest-1@guest.invalid"))).rejects.toMatchObject({ status: 403 });
  });
  it("does not let an ordinary unlisted account in just because guest access is on", async () => {
    vi.stubEnv("PRONTO_DEMO_GUEST_ACCESS", "1");
    await expect(assertDemoActor(actor("stranger@example.com"))).rejects.toMatchObject({ status: 403 });
    await expect(assertDemoActor(actor("owner@example.com", "00000000-0000-4000-8000-0000000000ff"))).resolves.toBeUndefined();
  });
});
