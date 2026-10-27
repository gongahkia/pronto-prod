import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { safeReturnTo } from "@/lib/auth-navigation";
import { publicAppUrl } from "@/lib/http/redirect";
import { guestAccessEnabled, guestMayRequest, isGuestEmail } from "@/lib/guest-policy";
import { decodeSession } from "@/lib/session-token";

const SESSION_COOKIE = "pronto_session";
const PROTECTED_PREFIXES = [
  "/account", "/access",
  "/operator",
  "/client",
  "/api/operator",
  "/api/client",
  "/api/escalations",
  "/demo",
  "/api/demo",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const nonce = randomBytes(16).toString("base64");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );
  if (isProtected && !request.cookies.has(SESSION_COOKIE)) {
    const response = pathname.startsWith("/api/")
      ? NextResponse.json({ error: "Unauthenticated." }, { status: 401 })
      : redirectToLogin(request);
    applySecurityHeaders(response, nonce);
    return response;
  }

  // Guest reviewers may read the demo and leave feedback; any other write is refused here, before any route runs.
  if (guestAccessEnabled() && isGuestSession(request) && !guestMayRequest(request.method, pathname)) {
    const response = NextResponse.json({ error: "This is a read-only preview. You can leave feedback comments." }, { status: 403 });
    applySecurityHeaders(response, nonce);
    return response;
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  applySecurityHeaders(response, nonce);
  return response;
}

export const config = {
  matcher: [
    /*
     * Apply security headers to route handlers and rendered routes while
     * skipping static assets that do not execute script.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

function isGuestSession(request: NextRequest): boolean {
  try {
    const payload = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
    return Boolean(payload && isGuestEmail(payload.email));
  } catch { return false; }
}

function redirectToLogin(request: NextRequest): NextResponse {
  const url = publicAppUrl(guestAccessEnabled() ? "/enter" : "/login", request.url);
  const next = safeReturnTo(request.nextUrl.pathname + request.nextUrl.search);
  if (next) url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

function applySecurityHeaders(response: NextResponse, nonce: string): void {
  response.headers.set("x-nonce", nonce);
  response.headers.set("Content-Security-Policy", buildContentSecurityPolicy(nonce));
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload",
  );
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
}

function buildContentSecurityPolicy(nonce: string): string {
  const isDevelopment = process.env.NODE_ENV !== "production";
  const directives = [
    "default-src 'self'",
    isDevelopment
      ? `script-src 'self' 'nonce-${nonce}' 'unsafe-eval'`
      : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    isDevelopment
      ? "form-action 'self' http://localhost:* http://127.0.0.1:*"
      : "form-action 'self'",
    "object-src 'none'",
  ];
  if (!isDevelopment) {
    directives.push("upgrade-insecure-requests");
  }

  return directives.join("; ");
}
