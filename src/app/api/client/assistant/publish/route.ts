import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/http/csrf";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const user = await requireUser("client");
  if (!user.clientId) return NextResponse.json({ error: "Client workspace missing." }, { status: 400 });
  return NextResponse.json({ error: "Pronto publishes business-approved changes. Request approval of the current draft." }, { status: 403 });
}
