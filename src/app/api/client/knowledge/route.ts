import { publicAppUrl } from "@/lib/http/redirect";
import { assertSameOrigin } from "@/lib/http/csrf";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { recordSourceExtractionFailure, submitKnowledgeSource } from "@/lib/knowledge/submissions";
import { extractFileSource, extractHtmlSource, extractTextSource, extractUrlSource } from "@/lib/knowledge/source-extract";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const user = await requireUser("client");
  if (!user.clientId) {
    return NextResponse.json({ error: "Client user has no client." }, { status: 400 });
  }

  const form = await request.formData();
  const title = String(form.get("title") ?? "").trim();
  const manualContent = String(form.get("content") ?? "").trim();
  const sourceUrl = String(form.get("sourceUrl") ?? "").trim();
  const upload = form.get("file");
  let extracted: Awaited<ReturnType<typeof extractTextSource>>;
  try {
    const inputCount = Number(upload instanceof File && upload.size > 0) + Number(Boolean(sourceUrl)) + Number(Boolean(manualContent));
    if (inputCount !== 1) throw new Error("Choose one source: a webpage, an uploaded file, or pasted content.");
    extracted = upload instanceof File && upload.size > 0 ? await extractFileSource(upload)
      : sourceUrl ? await extractUrlSource(sourceUrl)
      : String(form.get("textFormat")) === "html" ? await extractHtmlSource(manualContent) : await extractTextSource(manualContent);
  } catch (error) {
    if (title && title.length <= 200) await recordSourceExtractionFailure({ actor: user, clientId: user.clientId,
      sourceType: upload instanceof File && upload.size > 0 && upload.name.toLowerCase().endsWith(".pdf") ? "pdf" : sourceUrl ? "url" : "text",
      title, error: errorToMessage(error) });
    return NextResponse.json({ error: errorToMessage(error) }, { status: 400 });
  }
  try {
    const resolvedTitle = title || (upload instanceof File && upload.size > 0 ? upload.name.replace(/\.[^.]+$/, "") : "");
    await submitKnowledgeSource({ actor: user, clientId: user.clientId, sourceType: extracted.sourceType,
      title: resolvedTitle, description: String(form.get("description") ?? ""), content: extracted.content,
      sourceUrl: extracted.sourceUrl, outletName: String(form.get("outletName") ?? ""), metadata: extracted.metadata,
      requestKey: String(form.get("requestKey") ?? "") || undefined });
  } catch (error) {
    return NextResponse.json({ error: errorToMessage(error) }, { status: 400 });
  }
  return NextResponse.redirect(publicAppUrl("/client/knowledge?submitted=1", request.url), 303);
}

function errorToMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
