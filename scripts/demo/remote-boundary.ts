import http, { type IncomingHttpHeaders } from "node:http";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import type { Socket } from "node:net";

export async function privateFile(path: string): Promise<Buffer> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o600 || info.size > 65536)
      throw new Error("Private configuration must be an owned regular mode-600 file under 64 KB.");
    return await file.readFile();
  } finally { await file.close(); }
}

export function approvedEmails(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).sort().join(",") !== "gabriel,keith")
    throw new Error("Provide explicitly approved gabriel and keith email addresses.");
  const addresses = Object.values(value).map(v => typeof v === "string" ? v.trim().toLowerCase() : "");
  if (new Set(addresses).size !== 2 || addresses.some(v => v.length > 254 ||
      !/^[a-z0-9.!#$&'+=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(v) ||
      /\.(test|invalid|example|localhost)$/.test(v) || /[*\s,;<>]/.test(v)))
    throw new Error("Two distinct exact deliverable email addresses are required; wildcard domains are forbidden.");
  return addresses;
}

export function tunnelOrigin(value: string): string {
  const u = new URL(value);
  if (u.protocol !== "https:" || u.username || u.password || u.port || u.pathname !== "/" || u.search || u.hash ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com$/.test(u.hostname))
    throw new Error("Expected the HTTPS origin assigned to this protected Quick Tunnel.");
  return u.origin;
}

export function remotePathAllowed(target: string, method: string): boolean {
  const path = target.split("?")[0];
  if (!path.startsWith("/") || /[%\\\s]/.test(path) || path.includes("//") ||
      /(?:^|\/)\.{1,2}(?:\/|$)/.test(path)) return false;
  const mutation = /^\/api\/(?:auth\/(?:login|logout)|demo\/customer|escalations|client\/conversations\/[0-9a-f-]{36})$/.test(path);
  if (method === "POST") return mutation;
  if (!["GET", "HEAD"].includes(method)) return false;
  return ["/", "/login", "/account", "/access", "/demo/customer", "/client", "/client/inbox", "/favicon.ico",
    "/api/demo/customer", "/api/health", "/api/readiness"].includes(path) ||
    /^\/client\/conversations\/[0-9a-f-]{36}$/.test(path) || path.startsWith("/_next/static/");
}

export function originHeaders(headers: IncomingHttpHeaders, origin: string): IncomingHttpHeaders {
  const result: IncomingHttpHeaders = {};
  const nominated = new Set(String(headers.connection ?? "").toLowerCase().split(",").map(x => x.trim()));
  for (const [key, value] of Object.entries(headers)) {
    if (nominated.has(key) || /^(?:host|connection|keep-alive|transfer-encoding|upgrade|proxy-.*|te|trailer|forwarded|x-forwarded-.*|x-middleware-.*|x-nextjs-.*|cf-.*)$/i.test(key)) continue;
    result[key] = value;
  }
  result.host = new URL(origin).host;
  result["x-forwarded-host"] = result.host;
  result["x-forwarded-proto"] = "https";
  result["x-forwarded-port"] = "443";
  return result;
}

// Only cloudflared connects here. Closed until production readiness has passed;
// closing it destroys existing streams as well as refusing new requests.
export function demoGateway(upstreamPort: number) {
  let origin: string | undefined;
  const sockets = new Set<Socket>();
  const server = http.createServer({ maxHeaderSize: 16384 }, (req, res) => {
    const fail = (status: number, message: string) => {
      res.writeHead(status, { "Content-Type": "text/plain", "Cache-Control": "no-store", Connection: "close" });
      res.end(message);
    };
    if (!origin) return fail(503, "Remote demonstration is not enabled.");
    if (!remotePathAllowed(req.url ?? "", req.method ?? "") || req.headers["next-action"])
      return fail(404, "This route is not part of the remote demonstration.");
    if (req.headers.host !== new URL(origin).host) return fail(421, "Unexpected demonstration host.");
    if (req.headers.origin && req.headers.origin !== origin) return fail(403, "Cross-origin request rejected.");
    const body: Buffer[] = []; let size = 0;
    req.on("data", chunk => {
      size += chunk.length;
      if (size > 65536) { fail(413, "Demonstration request is too large."); req.destroy(); }
      else body.push(chunk);
    });
    req.on("end", () => {
      if (res.writableEnded || !origin) return;
      const upstream = http.request({ hostname: "127.0.0.1", port: upstreamPort,
        method: req.method, path: req.url, headers: originHeaders(req.headers, origin), timeout: 45000 }, response => {
        res.writeHead(response.statusCode ?? 502, response.headers); response.pipe(res);
      });
      upstream.on("timeout", () => upstream.destroy());
      upstream.on("error", () => { if (!res.headersSent) fail(502, "Demonstration application unavailable. Please retry."); else res.destroy(); });
      res.on("close", () => upstream.destroy());
      upstream.end(Buffer.concat(body));
    });
  });
  server.headersTimeout = 10000;
  server.requestTimeout = 30000;
  server.on("connection", socket => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
  server.on("upgrade", (_request, socket) => socket.destroy());
  return {
    server,
    enable(value: string) { origin = tunnelOrigin(value); },
    revoke() { origin = undefined; for (const socket of sockets) socket.destroy(); },
  };
}
