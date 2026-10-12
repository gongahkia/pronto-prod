import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  query: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireUser: mocks.requireUser,
}));

vi.mock("@/lib/db", () => ({
  query: mocks.query,
}));

import { POST } from "@/app/api/client/settings/route";

describe("client settings route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({
      userId: "user-1",
      clientId: "client-1",
      role: "client",
    });
    mocks.query.mockResolvedValue({ rows: [] });
  });

  it("updates the location without mutating customer-channel owner contacts", async () => {
    const form = new FormData();
    form.set("location", "North Bridge Road");
    form.set("ownerChatId", "12345");
    form.set("ownerPhone", "6590000000");

    const response = await POST(
      new Request("http://localhost/api/client/settings", {
        method: "POST",
        headers: {
          host: "localhost",
          origin: "http://localhost",
        },
        body: form,
      }),
    );

    expect(mocks.query.mock.calls[0][1]).toEqual(["client-1", "North Bridge Road"]);
    expect(mocks.query.mock.calls.every(([sql]) => !String(sql).includes("update channels"))).toBe(true);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/client/settings");
  });
});
