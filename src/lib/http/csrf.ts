import { NextResponse } from "next/server";
import { appBaseUrl } from "@/lib/env";

export function assertSameOrigin(request: Request): NextResponse | null {
  const origin = request.headers.get("origin");
  const allowedHosts = new Set<string>();
  const host = request.headers.get("host");
  if (host) allowedHosts.add(host.toLowerCase());

  try {
    allowedHosts.add(new URL(appBaseUrl()).host.toLowerCase());
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
        const refererHost = new URL(referer).host.toLowerCase();
        if (allowedHosts.has(refererHost)) return null;
      } catch {
        return NextResponse.json({ error: "Invalid Referer header." }, { status: 403 });
      }
    }
    return NextResponse.json({ error: "Origin header required." }, { status: 403 });
  }

  try {
    const originHost = new URL(origin).host.toLowerCase();
    if (allowedHosts.has(originHost)) return null;
  } catch {
    return NextResponse.json({ error: "Invalid Origin header." }, { status: 403 });
  }

  return NextResponse.json({ error: "Cross-origin mutation rejected." }, { status: 403 });
}
