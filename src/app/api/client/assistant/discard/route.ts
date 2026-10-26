import { publicAppUrl } from "@/lib/http/redirect";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { discardAssistantDraft } from "@/lib/assistant-drafts";
import { assertSameOrigin } from "@/lib/http/csrf";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const user = await requireUser("client");
  if (!user.clientId) return NextResponse.json({ error: "Client workspace missing." }, { status: 400 });
  await discardAssistantDraft(user.clientId, user.userId);
  return NextResponse.redirect(publicAppUrl("/client/assistant", request.url), 303);
}
