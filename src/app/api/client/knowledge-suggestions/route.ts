import { publicAppUrl } from "@/lib/http/redirect";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/http/csrf";
import { createKnowledgeSuggestion, reviseKnowledgeSuggestion, reviewKnowledgeSuggestion } from "@/lib/knowledge/suggestions";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const actor = await requireUser("client");
  if (!actor.clientId) return NextResponse.json({ error: "Business assignment required." }, { status: 403 });
  const form = await request.formData();
  const action = String(form.get("action") ?? "create");
  try {
    if (action === "create") {
      await createKnowledgeSuggestion({ actor, clientId: actor.clientId,
        sourceId: String(form.get("sourceId") ?? "") || null,
        title: String(form.get("title") ?? ""), content: String(form.get("content") ?? ""),
        reason: String(form.get("reason") ?? ""), sourceReference: String(form.get("sourceReference") ?? ""),
        outletName: String(form.get("outletName") ?? ""), requestKey: String(form.get("requestKey") ?? "") || undefined });
    } else if (action === "revise") {
      await reviseKnowledgeSuggestion({ actor, clientId: actor.clientId,
        suggestionId: String(form.get("suggestionId") ?? ""), expectedRevision: Number(form.get("revision")),
        title: String(form.get("title") ?? ""), content: String(form.get("content") ?? ""),
        reason: String(form.get("reason") ?? ""), sourceReference: String(form.get("sourceReference") ?? ""),
        outletName: String(form.get("outletName") ?? "") });
    } else if (action === "approve" || action === "reject" || action === "request_revision") {
      await reviewKnowledgeSuggestion({ actor, clientId: actor.clientId,
        suggestionId: String(form.get("suggestionId") ?? ""), expectedRevision: Number(form.get("revision")),
        decision: action, note: String(form.get("note") ?? "") });
    } else return NextResponse.json({ error: "Unsupported suggestion action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Suggestion could not be saved." },
      { status: 409 });
  }
  return NextResponse.redirect(publicAppUrl("/client/knowledge?updated=1", request.url), 303);
}
