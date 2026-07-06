import { assertSameOrigin } from "@/lib/http/csrf";
import { NextResponse } from "next/server";
import { login } from "@/lib/auth";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const form = await request.formData();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");

  const user = await login(email, password);

  if (!user) {
    return NextResponse.redirect(new URL("/login?error=1", request.url), 303);
  }

  return NextResponse.redirect(
    new URL(user.role === "operator" ? "/operator" : "/client", request.url),
    303,
  );
}
