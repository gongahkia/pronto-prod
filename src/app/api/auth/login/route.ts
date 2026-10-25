import { assertSameOrigin } from "@/lib/http/csrf";
import { NextResponse } from "next/server";
import { login } from "@/lib/auth";
import { safeReturnTo, signedInDestination } from "@/lib/auth-navigation";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const form = await request.formData();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const returnTo = safeReturnTo(form.get("next"));

  const user = await login(email, password);

  if (!user) {
    const destination = new URL("/login?error=1", request.url);
    if (returnTo) destination.searchParams.set("next", returnTo);
    return NextResponse.redirect(destination, 303);
  }

  return NextResponse.redirect(
    new URL(signedInDestination(user.role, returnTo), request.url),
    303,
  );
}
