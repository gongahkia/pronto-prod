import { NextResponse } from "next/server";
import { appBaseUrl } from "@/lib/env";

export function assertSameOrigin(request: Request): NextResponse | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;

  const allowedHosts = new Set<string>();
  const host = request.headers.get("host");
  if (host) allowedHosts.add(host.toLowerCase());

  try {
    allowedHosts.add(new URL(appBaseUrl()).host.toLowerCase());
  } catch {
    return NextResponse.json({ error: "Invalid APP_BASE_URL." }, { status: 500 });
  }

  try {
    const originHost = new URL(origin).host.toLowerCase();
    if (allowedHosts.has(originHost)) return null;
  } catch {
    return NextResponse.json({ error: "Invalid Origin header." }, { status: 403 });
  }

  return NextResponse.json({ error: "Cross-origin mutation rejected." }, { status: 403 });
}
