import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { DraftConflictError, publishAssistantDraft } from "@/lib/assistant-drafts";
import { assertSameOrigin } from "@/lib/http/csrf";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const user = await requireUser("client");
  if (!user.clientId) return NextResponse.json({ error: "Client workspace missing." }, { status: 400 });
  try {
    const revision = await publishAssistantDraft(user.clientId, user.userId);
    return NextResponse.redirect(new URL(`/client/assistant?published=${revision}`, request.url), 303);
  } catch (error) {
    if (error instanceof DraftConflictError) {
      return NextResponse.redirect(new URL("/client/assistant?error=conflict", request.url), 303);
    }
    const message = error instanceof Error ? error.message : "Could not publish changes.";
    return NextResponse.redirect(new URL(`/client/assistant?error=${encodeURIComponent(message)}`, request.url), 303);
  }
}
