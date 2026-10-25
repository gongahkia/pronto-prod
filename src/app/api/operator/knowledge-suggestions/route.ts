import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/http/csrf";
import { stageApprovedKnowledgeSuggestion } from "@/lib/knowledge/suggestions";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const actor = await requireUser("operator");
  const form = await request.formData();
  const clientId = String(form.get("clientId") ?? "");
  try {
    await stageApprovedKnowledgeSuggestion({ actor, clientId,
      suggestionId: String(form.get("suggestionId") ?? ""), expectedRevision: Number(form.get("revision")) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Suggestion could not be prepared." },
      { status: 409 });
  }
  return NextResponse.json({ ok: true, clientId });
}
