// @vitest-environment node
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import { approvedEmails, demoGateway, originHeaders, remotePathAllowed, tunnelOrigin } from "../../scripts/demo/remote-boundary";

describe("free protected remote demonstration boundary", () => {
  it("requires exactly two explicitly named, distinct exact addresses", () => {
    expect(approvedEmails({ gabriel: "Gabriel@Mail.com", keith: "keith@mail.com" })).toEqual(["gabriel@mail.com", "keith@mail.com"]);
    for (const value of [[], null, {}, { gabriel: "a@mail.com" }, { gabriel: "a@mail.com", keith: "a@mail.com" },
      { gabriel: "*@mail.com", keith: "k@mail.com" }, { gabriel: "a@mail.com,b@mail.com", keith: "k@mail.com" },
      { gabriel: "a@demo.test", keith: "k@mail.com" }, { gabriel: "a@mail.com", keith: "k@mail.com", extra: "e@mail.com" }])
      expect(() => approvedEmails(value)).toThrow();
  });
  it.each(["http://abc.trycloudflare.com", "https://abc.trycloudflare.com.evil.com", "https://user@abc.trycloudflare.com",
    "https://abc.trycloudflare.com:444", "https://abc.trycloudflare.com/login", "https://abc.trycloudflare.com?q=x"])("rejects untrusted assigned origin %s", value => {
    expect(() => tunnelOrigin(value)).toThrow();
  });
  it("accepts only a clean assigned HTTPS origin", () => {
    expect(tunnelOrigin("https://synthetic-demo.trycloudflare.com")).toBe("https://synthetic-demo.trycloudflare.com");
  });
  it.each(["/operator", "/api/operator/inspect", "/api/channels/instagram/webhook", "/api/client/channels", "/api/client/knowledge",
    "/api/debug", "/_next/webpack-hmr", "/__nextjs_original-stack-frames", "/metrics", "/.env", "/%2e%2e/api/operator",
    "/demo/../operator", "//api/demo/customer", "/_next/static/../../.env", "/_next/static/%2e%2e/file"])("does not expose %s", path => {
    expect(remotePathAllowed(path, "GET")).toBe(false); expect(remotePathAllowed(path, "POST")).toBe(false);
  });
  it("keeps only customer, inbox, auth, static and existing handoff routes", () => {
    for (const path of ["/login", "/demo/customer", "/client/inbox?status=pending", "/_next/static/chunks/test.js", "/client/conversations/00000000-0000-4000-8000-00000000a101"])
      expect(remotePathAllowed(path, "GET")).toBe(true);
    for (const path of ["/api/auth/login", "/api/auth/logout", "/api/demo/customer", "/api/escalations", "/api/client/conversations/00000000-0000-4000-8000-00000000a101"])
      expect(remotePathAllowed(path, "POST")).toBe(true);
    expect(remotePathAllowed("/demo/customer", "POST")).toBe(false);
    expect(remotePathAllowed("/api/demo/customer", "DELETE")).toBe(false);
  });
  it("overwrites proxy identity, strips middleware/hop headers and retains app auth/RSC", () => {
    const result = originHeaders({ host: "evil.com", forwarded: "evil", "x-forwarded-host": "evil.com", "x-forwarded-proto": "http",
      "x-middleware-subrequest": "bypass", "x-nextjs-data": "1", "cf-access-jwt-assertion": "untrusted",
      connection: "x-custom-hop", "x-custom-hop": "hop", cookie: "synthetic", rsc: "1" }, "https://demo.trycloudflare.com");
    expect(result).toEqual({ host: "demo.trycloudflare.com", "x-forwarded-host": "demo.trycloudflare.com",
      "x-forwarded-proto": "https", "x-forwarded-port": "443", cookie: "synthetic", rsc: "1" });
  });
  it("starts closed, rejects unexpected hosts/origins and closes again on revocation", () => {
    const gateway = demoGateway(3003);
    const request = (path: string, host = "demo.trycloudflare.com", origin?: string) => {
      let status = 0;
      const req = Object.assign(new EventEmitter(), { url: path, method: "GET", headers: { host, ...(origin ? { origin } : {}) } }) as IncomingMessage;
      const res = { writeHead(code: number) { status = code; }, end() {} } as unknown as ServerResponse;
      gateway.server.emit("request", req, res); return status;
    };
    expect(request("/login")).toBe(503);
    gateway.enable("https://demo.trycloudflare.com");
    expect(request("/api/operator/inspect")).toBe(404);
    expect(request("/login", "evil.com")).toBe(421);
    expect(request("/login", "demo.trycloudflare.com", "http://demo.trycloudflare.com")).toBe(403);
    gateway.revoke(); expect(request("/login")).toBe(503);
  });
});
