import { publicAppUrl } from "@/lib/http/redirect";
import { assertSameOrigin } from "@/lib/http/csrf";
import { NextResponse } from "next/server";
import { login } from "@/lib/auth";
import { safeReturnTo, signedInDestination } from "@/lib/auth-navigation";
import { allowLoginAttempt } from "@/lib/login-throttle";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const form = await request.formData();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const returnTo = safeReturnTo(form.get("next"));

  try {
    if (!await allowLoginAttempt(email)) return NextResponse.json({ error: "Too many sign-in attempts. Please wait 15 minutes and try again." },
      { status: 429, headers: { "Retry-After": "900", "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Sign-in is temporarily unavailable. Please retry shortly." }, { status: 503 }); }

  const user = await login(email, password);

  if (!user) {
    const destination = publicAppUrl("/login?error=1", request.url);
    if (returnTo) destination.searchParams.set("next", returnTo);
    return NextResponse.redirect(destination, 303);
  }

  return NextResponse.redirect(
    publicAppUrl(signedInDestination(user.role, returnTo), request.url),
    303,
  );
}
