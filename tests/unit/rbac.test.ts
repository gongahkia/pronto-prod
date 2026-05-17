import { describe, expect, it } from "vitest";
import { canAccessClient, canUseOperatorRoutes, clientAccessError } from "@/lib/rbac";
import type { SessionUser } from "@/lib/auth";

const operator: SessionUser = {
  userId: "operator-1",
  email: "operator@pronto.sg",
  name: "Operator",
  role: "operator",
  clientId: null,
};

const clientUser: SessionUser = {
  userId: "client-user-1",
  email: "owner@example.com",
  name: "Owner",
  role: "client",
  clientId: "client-1",
};

describe("RBAC helpers", () => {
  it("lets operators access any client and operator routes", () => {
    expect(canAccessClient(operator, "client-1")).toBe(true);
    expect(canAccessClient(operator, "client-2")).toBe(true);
    expect(canUseOperatorRoutes(operator)).toBe(true);
  });

  it("prevents client users from accessing other tenants and operator routes", () => {
    expect(canAccessClient(clientUser, "client-1")).toBe(true);
    expect(canAccessClient(clientUser, "client-2")).toBe(false);
    expect(canUseOperatorRoutes(clientUser)).toBe(false);
    expect(clientAccessError(clientUser, "client-2")).toContain("cannot access");
  });
});
