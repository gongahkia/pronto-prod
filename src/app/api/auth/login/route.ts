import { NextResponse } from "next/server";
import { login } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { checkRateLimit } from "@/lib/http-limits";

const LOGIN_RATE_LIMIT_MAX = 5;
const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60_000;

export async function POST(request: Request) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const normalizedEmail = normalizeLoginEmail(email);
  const ipKey = coarseIpKey(request);
  const rateLimit = checkRateLimit(
    `auth:login:${normalizedEmail || "blank"}:${ipKey}`,
    LOGIN_RATE_LIMIT_MAX,
    LOGIN_RATE_LIMIT_WINDOW_MS,
  );

  if (!rateLimit.allowed) {
    await recordAuditLog({
      clientId: null,
      actorUserId: null,
      action: "auth.login_rate_limited",
      targetType: "user",
      metadata: {
        email: normalizedEmail,
        ipKey,
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
    });

    return NextResponse.json(
      { error: "Too many login attempts. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  const user = await login(email, password);

  if (!user) {
    return NextResponse.redirect(new URL("/login?error=1", request.url), 303);
  }

  return NextResponse.redirect(
    new URL(user.role === "operator" ? "/operator" : "/client", request.url),
    303,
  );
}

function normalizeLoginEmail(email: string): string {
  return email.trim().toLowerCase();
}

function coarseIpKey(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const candidate =
    forwardedFor?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip")?.trim() ??
    "local";

  if (candidate === "local") {
    return candidate;
  }

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(candidate)) {
    const parts = candidate.split(".");
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  }

  if (candidate.includes(":")) {
    return `${candidate.split(":").slice(0, 4).join(":")}::/64`;
  }

  return "provided";
}
