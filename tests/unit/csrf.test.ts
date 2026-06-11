import { describe, expect, it } from "vitest";
import { assertSameOrigin } from "@/lib/http/csrf";

describe("same-origin mutation guard", () => {
  it("accepts same-origin requests", () => {
    const request = new Request("http://localhost:3000/api/test", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
      },
    });

    expect(assertSameOrigin(request)).toBeNull();
  });

  it("rejects cross-origin requests", async () => {
    const request = new Request("http://localhost:3000/api/test", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "https://evil.example",
      },
    });

    const response = assertSameOrigin(request);
    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({
      error: "Cross-origin mutation rejected.",
    });
  });
});
