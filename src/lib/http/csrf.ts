import { NextResponse } from "next/server";
import { appBaseUrl } from "@/lib/env";

export function assertSameOrigin(request: Request): NextResponse | null {
  const origin = request.headers.get("origin");
  const allowedHosts = new Set<string>();
  const allowedOrigins = new Set<string>();
  const host = request.headers.get("host");
  if (host) allowedHosts.add(host.toLowerCase());

  try {
    const app = new URL(appBaseUrl());
    allowedHosts.add(app.host.toLowerCase());
    allowedOrigins.add(app.origin);
    // Authenticated administration can still use the private loopback listener.
    // The remote gateway replaces Host; forwarded headers never grant this exception.
    const local = new URL(request.url);
    if (["127.0.0.1", "localhost", "[::1]"].includes(local.hostname) &&
        local.host === host?.toLowerCase()) allowedOrigins.add(local.origin);
  } catch {
    return NextResponse.json({ error: "Invalid APP_BASE_URL." }, { status: 500 });
  }

  if (!origin) {
    if (request.headers.get("sec-fetch-site") === "same-origin") {
      return null;
    }
    const referer = request.headers.get("referer");
    if (referer) {
      try {
        const ref = new URL(referer);
        if (process.env.NODE_ENV === "production" ? allowedOrigins.has(ref.origin) : allowedHosts.has(ref.host.toLowerCase())) return null;
      } catch {
        return NextResponse.json({ error: "Invalid Referer header." }, { status: 403 });
      }
    }
    return NextResponse.json({ error: "Origin header required." }, { status: 403 });
  }

  try {
    const parsed = new URL(origin);
    if (process.env.NODE_ENV === "production" ? allowedOrigins.has(parsed.origin) : allowedHosts.has(parsed.host.toLowerCase())) return null;
  } catch {
    return NextResponse.json({ error: "Invalid Origin header." }, { status: 403 });
  }

  return NextResponse.json({ error: "Cross-origin mutation rejected." }, { status: 403 });
}
