import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  query: vi.fn(),
  hashPassword: vi.fn(),
  recordAuditLog: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireUser: mocks.requireUser,
}));

vi.mock("@/lib/db", () => ({
  query: mocks.query,
}));

vi.mock("@/lib/password", () => ({
  hashPassword: mocks.hashPassword,
}));

vi.mock("@/lib/audit", () => ({
  recordAuditLog: mocks.recordAuditLog,
}));

import { POST as postCreateUser } from "@/app/api/operator/clients/[clientId]/users/route";
import { POST as postDeleteUser } from "@/app/api/operator/clients/[clientId]/users/[userId]/delete/route";

describe("operator client users route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({
      userId: "actor-1",
      role: "operator",
    });
    mocks.hashPassword.mockResolvedValue("scrypt$x$y");
  });

  it("creates a new client user when inputs are valid", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ id: "client-1" }] }) // client exists
      .mockResolvedValueOnce({ rows: [] }) // email not taken
      .mockResolvedValueOnce({ rows: [{ id: "user-99" }] }); // insert returning id

    const form = new FormData();
    form.set("name", "New Owner");
    form.set("email", " Owner@Example.com ");
    form.set("password", "long-enough-pw");
    form.set("role", "client");

    const response = await postCreateUser(
      new Request("http://localhost/api/operator/clients/client-1/users", {
        method: "POST",
        body: form,
      }),
      { params: Promise.resolve({ clientId: "client-1" }) },
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain(
      "/operator/clients/client-1/users",
    );
    expect(mocks.hashPassword).toHaveBeenCalledWith("long-enough-pw");
    expect(mocks.query.mock.calls[2][1]).toEqual([
      "client-1",
      "owner@example.com",
      "New Owner",
      "client",
      "scrypt$x$y",
    ]);
    expect(mocks.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "client_user.created" }),
    );
  });

  it("rejects short passwords with a redirect carrying the error", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ id: "client-1" }] });

    const form = new FormData();
    form.set("name", "A");
    form.set("email", "a@example.com");
    form.set("password", "short");

    const response = await postCreateUser(
      new Request("http://localhost/api/operator/clients/client-1/users", {
        method: "POST",
        body: form,
      }),
      { params: Promise.resolve({ clientId: "client-1" }) },
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("error=Password+must+be+at+least+8+characters");
    expect(mocks.hashPassword).not.toHaveBeenCalled();
  });

  it("prevents removing yourself", async () => {
    const response = await postDeleteUser(
      new Request(
        "http://localhost/api/operator/clients/client-1/users/actor-1/delete",
        { method: "POST" },
      ),
      {
        params: Promise.resolve({ clientId: "client-1", userId: "actor-1" }),
      },
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain(
      "error=You+cannot+remove+yourself",
    );
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("deletes a user that belongs to the client", async () => {
    mocks.query
      .mockResolvedValueOnce({
        rows: [{ id: "user-9", email: "old@example.com", role: "client" }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const response = await postDeleteUser(
      new Request(
        "http://localhost/api/operator/clients/client-1/users/user-9/delete",
        { method: "POST" },
      ),
      {
        params: Promise.resolve({ clientId: "client-1", userId: "user-9" }),
      },
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("ok=Removed+old%40example.com");
    expect(mocks.query.mock.calls[1][0]).toContain("delete from users");
    expect(mocks.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "client_user.deleted" }),
    );
  });
});
