import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "pronto_session";
const PROTECTED_PREFIXES = [
  "/operator",
  "/client",
  "/api/operator",
  "/api/client",
  "/api/assistant",
  "/api/escalations",
  "/api/console",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }
  if (request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/operator/:path*",
    "/client/:path*",
    "/api/operator/:path*",
    "/api/client/:path*",
    "/api/assistant/:path*",
    "/api/escalations/:path*",
    "/api/console/:path*",
  ],
};

