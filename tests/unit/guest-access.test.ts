import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ establish: vi.fn(), create: vi.fn(), query: vi.fn(), enabled: vi.fn() }));
vi.mock("@/lib/auth", () => ({ establishSession: mocks.establish, getSessionUser: vi.fn() }));
vi.mock("@/lib/guest-access", async (original) => ({ ...(await original<typeof import("@/lib/guest-access")>()), createGuestReviewer: mocks.create }));
vi.mock("@/lib/db", () => ({ query: mocks.query, transaction: vi.fn() }));

import { guestAccessEnabled, guestMayRequest, guestSimulatorEnabled, isGuestEmail } from "@/lib/guest-policy";
import { cleanGuestName } from "@/lib/guest-access";
import { encodeSession } from "@/lib/session-token";
import { proxy } from "@/proxy";
import { POST } from "@/app/api/auth/guest/route";
import { DemoError } from "@/lib/customer-demo-boundary";

const secret = "test-auth-secret-with-more-than-32-characters-x";
const cookie = (email: string) => `pronto_session=${encodeSession({ userId: "u1", email, name: "Keith", role: "client", clientId: "c1", exp: Math.floor(Date.now() / 1000) + 3600, sv: 1 })}`;
const req = (path: string, method = "GET", email?: string) => new NextRequest(`http://localhost${path}`, { method, headers: email ? { cookie: cookie(email) } : {} });
const guestEnv = () => { vi.stubEnv("PRONTO_DEMO_GUEST_ACCESS", "1"); vi.stubEnv("PRONTO_CUSTOMER_DEMO_ENABLED", "1"); vi.stubEnv("AUTH_SECRET", secret); };
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllEnvs());

describe("guest access is opt-in", () => {
  it("is off by default and cannot be enabled outside the demo deployment", () => {
    expect(guestAccessEnabled()).toBe(false);
    vi.stubEnv("PRONTO_DEMO_GUEST_ACCESS", "1");
    expect(guestAccessEnabled()).toBe(false);
    vi.stubEnv("PRONTO_CUSTOMER_DEMO_ENABLED", "1");
    expect(guestAccessEnabled()).toBe(true);
    expect(guestSimulatorEnabled()).toBe(false);
    vi.stubEnv("PRONTO_DEMO_GUEST_SIMULATOR", "1");
    expect(guestSimulatorEnabled()).toBe(true);
  });
  it("recognises only reserved guest addresses and cleans names", () => {
    expect(isGuestEmail("guest-1@guest.invalid")).toBe(true);
    expect(isGuestEmail("keith@guest.invalid.example.com")).toBe(false);
    expect(isGuestEmail("owner@example.com")).toBe(false);
    expect(cleanGuestName("  <b>Keith</b>\n  Tan ")).toBe("bKeith/b Tan");
    expect(cleanGuestName("   ")).toBeNull();
    expect(cleanGuestName(42)).toBeNull();
    expect(cleanGuestName("x".repeat(100))).toHaveLength(40);
  });
});

describe("guest write policy", () => {
  it("allows reads and feedback only, with the simulator behind its own switch", () => {
    guestEnv();
    expect(guestMayRequest("GET", "/client/knowledge")).toBe(true);
    expect(guestMayRequest("POST", "/api/demo/feedback")).toBe(true);
    expect(guestMayRequest("POST", "/api/demo/feedback/")).toBe(true);
    for (const path of ["/api/client/settings", "/api/client/knowledge", "/api/client/channels", "/api/operator/agent-config", "/api/demo/customer", "/api/demo/process"])
      expect(guestMayRequest("POST", path)).toBe(false);
    expect(guestMayRequest("DELETE", "/api/client/knowledge/abc")).toBe(false);
    vi.stubEnv("PRONTO_DEMO_GUEST_SIMULATOR", "1");
    expect(guestMayRequest("POST", "/api/demo/customer")).toBe(true);
    expect(guestMayRequest("POST", "/api/client/settings")).toBe(false);
  });
});

describe("request proxy for guest sessions", () => {
  it("sends visitors without a session to the name page instead of the sign-in form", () => {
    guestEnv();
    expect(proxy(req("/client/inbox")).headers.get("location")).toContain("/enter");
    vi.stubEnv("PRONTO_DEMO_GUEST_ACCESS", "0");
    expect(proxy(req("/client/inbox")).headers.get("location")).toContain("/login");
  });
  it("lets a guest read and comment but refuses every other write before any route runs", async () => {
    guestEnv();
    const guest = "guest-1@guest.invalid";
    expect(proxy(req("/client/knowledge", "GET", guest)).status).toBe(200);
    expect(proxy(req("/api/demo/feedback", "POST", guest)).status).toBe(200);
    for (const path of ["/api/client/settings", "/api/client/knowledge", "/api/client/flows", "/api/escalations", "/api/demo/customer"]) {
      const response = proxy(req(path, "POST", guest));
      expect(response.status).toBe(403);
      expect((await response.json()).error).toMatch(/read-only/i);
    }
  });
  it("does not restrict real team members, and ignores a forged or unsigned guest cookie", () => {
    guestEnv();
    expect(proxy(req("/api/client/settings", "POST", "owner@example.com")).status).toBe(200);
    const forged = new NextRequest("http://localhost/api/client/settings", { method: "POST", headers: { cookie: "pronto_session=eyJ4IjoxfQ.bad" } });
    expect(proxy(forged).status).toBe(200); // not a verified guest; the route's own session check still applies
  });
  it("applies no guest rules at all when the feature is off", () => {
    vi.stubEnv("AUTH_SECRET", secret);
    expect(proxy(req("/api/client/settings", "POST", "guest-1@guest.invalid")).status).toBe(200);
  });
});

describe("POST /api/auth/guest", () => {
  const form = (fields: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.set(k, v); return f; };
  const post = (fields: Record<string, string>) => POST(new Request("http://localhost:3000/api/auth/guest", { method: "POST", headers: { origin: "http://localhost:3000" }, body: form(fields) }));
  it("does not exist when guest access is off", async () => { expect((await post({ name: "Keith" })).status).toBe(404); expect(mocks.create).not.toHaveBeenCalled(); });
  it("starts a session and returns to the requested demo page", async () => {
    guestEnv(); mocks.create.mockResolvedValue({ id: "u1" });
    const response = await post({ name: "Keith", next: "/client/knowledge" });
    expect(response.status).toBe(303); expect(response.headers.get("location")).toBe("http://localhost:3000/client/knowledge");
    expect(mocks.establish).toHaveBeenCalledWith({ id: "u1" });
  });
  it("ignores an unsafe return address", async () => {
    guestEnv(); mocks.create.mockResolvedValue({ id: "u1" });
    expect((await post({ name: "Keith", next: "https://evil.example" })).headers.get("location")).toBe("http://localhost:3000/client");
  });
  it("shows the reason on the name page when a visitor is refused, and creates no session", async () => {
    guestEnv(); mocks.create.mockRejectedValue(new DemoError("Too many new visitors right now.", 429));
    const response = await post({ name: "Keith" });
    expect(response.status).toBe(303); expect(response.headers.get("location")).toContain("/enter?error=");
    expect(mocks.establish).not.toHaveBeenCalled();
  });
  it("rejects cross-site submissions", async () => {
    guestEnv();
    const response = await POST(new Request("http://localhost:3000/api/auth/guest", { method: "POST", headers: { origin: "https://evil.example" }, body: form({ name: "Keith" }) }));
    expect(response.status).toBe(403); expect(mocks.create).not.toHaveBeenCalled();
  });
});
