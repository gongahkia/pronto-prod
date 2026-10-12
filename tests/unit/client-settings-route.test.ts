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

  it("refuses a legacy direct business-fact edit and leaves customer channels untouched", async () => {
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

    expect(mocks.query).not.toHaveBeenCalled();
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Suggest a business knowledge correction for Pronto review." });
  });
});
