import { publicAppUrl } from "@/lib/http/redirect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { safeReturnTo, signedInDestination } from "@/lib/auth-navigation";

afterEach(() => vi.unstubAllEnvs());

describe("account navigation boundaries", () => {
  it("uses the configured production HTTPS origin behind a reverse proxy", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_BASE_URL", "https://demo.example.test");
    expect(publicAppUrl("/demo/customer", "http://internal:3000/login").href)
      .toBe("https://demo.example.test/demo/customer");
    expect(() => publicAppUrl("https://attacker.invalid", "http://internal/login")).toThrow();
  });
  it("rejects unsafe production origins and preserves development ports", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_BASE_URL", "http://demo.example.test");
    expect(() => publicAppUrl("/login", "http://internal/login")).toThrow(/HTTPS/);
    vi.stubEnv("NODE_ENV", "development");
    expect(publicAppUrl("/login", "http://localhost:3001/auth").origin).toBe("http://localhost:3001");
  });
  it.each(["/client/inbox", "/client/conversations/123-abc", "/demo/customer", "/client/inbox?status=pending"])("retains local application destination %s", path => {
    expect(safeReturnTo(path)).toBe(path);
  });
  it.each(["https://evil.test", "//evil.test", "/\\evil.test", "/client/../../api/operator", "/client/%2e%2e", "/client\n", "/operator", "/api/demo/customer", "/clientish", null])("rejects untrusted destination %s", path => {
    expect(safeReturnTo(path)).toBeNull();
  });
  it("explains business access instead of bouncing operators through login", () => {
    expect(signedInDestination("operator", "/client/inbox")).toBe("/access?reason=business-role");
    expect(signedInDestination("client", "/client/inbox")).toBe("/client/inbox");
    expect(signedInDestination("operator")).toBe("/account");
  });
});
