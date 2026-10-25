import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getAssistantDraft, stageVoice, type VoiceDraft } from "@/lib/assistant-drafts";
import { buildBrandVoiceDraft, getBrandVoiceProfile, parseBrandVoiceAttributes } from "@/lib/brand-voice";
import { getClient } from "@/lib/dashboard";
import { assertSameOrigin } from "@/lib/http/csrf";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const actor = await requireUser("operator");
  const form = await request.formData();
  const clientId = String(form.get("clientId") ?? "");
  const action = String(form.get("action") ?? "");
  if (!clientId) return NextResponse.json({ error: "Business is required." }, { status: 400 });
  const [profile, draft, client] = await Promise.all([getBrandVoiceProfile(clientId), getAssistantDraft(clientId), getClient(clientId)]);
  if (!client) return NextResponse.json({ error: "Business not found." }, { status: 404 });
  const voice: VoiceDraft = draft?.voice ?? {
    title: profile.document?.title ?? "Brand voice guide",
    content: profile.document?.content ?? "",
    attributes: profile.document?.attributes ?? {},
    sourceNotes: profile.document?.source_notes ?? null,
    examples: profile.examples.map((item) => ({ customerMessage: item.customer_message,
      idealResponse: item.ideal_response, notes: item.notes ?? "", active: item.is_active })),
  };
  try {
    if (action === "update_document") {
      voice.title = String(form.get("title") ?? "").trim();
      voice.content = String(form.get("content") ?? "").trim();
      voice.attributes = parseBrandVoiceAttributes(String(form.get("attributes") ?? ""));
      voice.sourceNotes = String(form.get("sourceNotes") ?? "").trim();
    } else if (action === "build_document") {
      const sourceText = String(form.get("builderSources") ?? "").trim();
      if (!sourceText) throw new Error("Source samples are required.");
      const built = buildBrandVoiceDraft({ clientName: client.name, sourceText });
      voice.title = built.title;
      voice.content = built.content;
      voice.attributes = built.attributes;
      voice.sourceNotes = built.sourceNotes;
    } else if (action === "add_example") {
      voice.examples.push({ customerMessage: String(form.get("customerMessage") ?? "").trim(),
        idealResponse: String(form.get("idealResponse") ?? "").trim(),
        notes: String(form.get("notes") ?? "").trim(), active: true });
    } else if (action === "toggle_example" || action === "delete_example") {
      const example = profile.examples.find((item) => item.id === String(form.get("exampleId") ?? ""));
      if (!example) return NextResponse.json({ error: "Example not found for this business." }, { status: 404 });
      const index = voice.examples.findIndex((item) => item.customerMessage === example.customer_message &&
        item.idealResponse === example.ideal_response);
      if (index < 0) return NextResponse.json({ error: "Draft changed; review before editing." }, { status: 409 });
      if (action === "delete_example") voice.examples.splice(index, 1);
      else voice.examples[index].active = form.get("isActive") === "true";
    } else return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
    await stageVoice({ clientId, actorUserId: actor.userId, voice });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not stage voice." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, clientId });
}
