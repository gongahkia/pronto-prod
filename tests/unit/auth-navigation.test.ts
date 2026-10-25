import { describe, expect, it } from "vitest";
import { safeReturnTo, signedInDestination } from "@/lib/auth-navigation";

describe("account navigation boundaries", () => {
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
