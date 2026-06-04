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

  it("persists owner phone and redirects to client settings", async () => {
    const form = new FormData();
    form.set("location", "North Bridge Road");
    form.set("ownerChatId", "12345");
    form.set("ownerPhone", "6590000000");

    const response = await POST(
      new Request("http://localhost/api/client/settings", {
        method: "POST",
        body: form,
      }),
    );

    expect(mocks.query.mock.calls[0][1]).toEqual([
      "client-1",
      "12345",
      "North Bridge Road",
      "6590000000",
    ]);
    expect(mocks.query.mock.calls[1][1]).toEqual([
      "client-1",
      JSON.stringify({ ownerChatId: "12345", ownerPhone: "6590000000" }),
    ]);
    expect(mocks.query.mock.calls[2][1]).toEqual([
      "client-1",
      "user-1",
      "client.settings.updated",
      "client",
      "client-1",
      { fields: ["location", "ownerChatId", "ownerPhone"] },
    ]);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/client/settings");
  });
});
