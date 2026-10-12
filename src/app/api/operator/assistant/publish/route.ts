import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { publishAssistantDraft } from "@/lib/assistant-drafts";
import { assertSameOrigin } from "@/lib/http/csrf";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const actor = await requireUser("operator");
  const form = await request.formData();
  const clientId = String(form.get("clientId") ?? "");
  if (!clientId) return NextResponse.json({ error: "Business is required." }, { status: 400 });
  try {
    await publishAssistantDraft(clientId, actor.userId);
    return NextResponse.redirect(new URL(`/operator/clients/${clientId}/knowledge`, request.url), 303);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Publication failed." }, { status: 409 });
  }
}
