import { afterEach, describe, expect, it, vi } from "vitest";
import { assertSameOrigin } from "@/lib/http/csrf";

describe("same-origin mutation guard", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("pins production mutations to the full HTTPS origin, ignoring forwarded headers", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_BASE_URL", "https://approved.trycloudflare.com");
    const check = (origin: string, host = "approved.trycloudflare.com") => assertSameOrigin(new Request("http://internal:3003/api/test", {
      method: "POST", headers: { host, origin, "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" },
    }));
    expect(check("https://approved.trycloudflare.com")).toBeNull();
    expect(check("http://approved.trycloudflare.com")?.status).toBe(403);
    expect(check("https://evil.example", "evil.example")?.status).toBe(403);
    expect(check("https://approved.trycloudflare.com:444")?.status).toBe(403);
  });
  it("permits authenticated CLI origin evidence only on its actual loopback host", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_BASE_URL", "https://approved.trycloudflare.com");
    const request = new Request("http://127.0.0.1:3003/api/auth/login", { method: "POST",
      headers: { host: "127.0.0.1:3003", origin: "http://127.0.0.1:3003" } });
    expect(assertSameOrigin(request)).toBeNull();
    request.headers.set("host", "approved.trycloudflare.com");
    expect(assertSameOrigin(request)?.status).toBe(403);
  });
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

  it("rejects requests without origin, fetch metadata, or referer evidence", async () => {
    const request = new Request("http://localhost:3000/api/test", {
      method: "POST",
      headers: {
        host: "localhost:3000",
      },
    });

    const response = assertSameOrigin(request);
    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({
      error: "Origin header required.",
    });
  });

  it("accepts missing-origin requests with same-origin fetch metadata", () => {
    const request = new Request("http://localhost:3000/api/test", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        "sec-fetch-site": "same-origin",
      },
    });

    expect(assertSameOrigin(request)).toBeNull();
  });
});
