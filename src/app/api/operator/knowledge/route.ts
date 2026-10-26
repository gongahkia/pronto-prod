import { assertSameOrigin } from "@/lib/http/csrf";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { recordSourceExtractionFailure, submitKnowledgeSource } from "@/lib/knowledge/submissions";
import { extractFileSource, extractHtmlSource, extractTextSource, extractUrlSource } from "@/lib/knowledge/source-extract";
import { canAccessClient } from "@/lib/rbac";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const user = await requireUser("operator");
  const form = await request.formData();
  const clientId = String(form.get("clientId") ?? "");
  const title = String(form.get("title") ?? "").trim();
  const manualContent = String(form.get("content") ?? "").trim();
  const sourceUrl = String(form.get("sourceUrl") ?? "").trim();
  const upload = form.get("file");

  if (!clientId) {
    return NextResponse.json(
      { error: "clientId is required." },
      { status: 400 },
    );
  }
  if (!canAccessClient(user, clientId)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let extracted: Awaited<ReturnType<typeof extractTextSource>>;
  try {
    extracted = upload instanceof File && upload.size > 0 ? await extractFileSource(upload)
      : sourceUrl ? await extractUrlSource(sourceUrl)
      : String(form.get("textFormat")) === "html" ? await extractHtmlSource(manualContent) : await extractTextSource(manualContent);
  } catch (error) {
    if (title && title.length <= 200) await recordSourceExtractionFailure({ actor: user, clientId,
      sourceType: upload instanceof File && upload.size > 0 && upload.name.toLowerCase().endsWith(".pdf") ? "pdf" : sourceUrl ? "url" : "text",
      title, error: errorToMessage(error) });
    return NextResponse.json({ error: errorToMessage(error) }, { status: 400 });
  }
  try {
    await submitKnowledgeSource({ actor: user, clientId, sourceType: extracted.sourceType,
      title: title || (upload instanceof File && upload.size > 0 ? upload.name.replace(/\.[^.]+$/, "") : ""),
      description: String(form.get("description") ?? ""), content: extracted.content,
      sourceUrl: extracted.sourceUrl, outletName: String(form.get("outletName") ?? ""), metadata: extracted.metadata,
      requestKey: String(form.get("requestKey") ?? "") || undefined });
  } catch (error) {
    return NextResponse.json({ error: errorToMessage(error) }, { status: 400 });
  }

  return NextResponse.json({ ok: true, clientId });
}


function errorToMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
