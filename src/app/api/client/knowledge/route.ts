import { assertSameOrigin } from "@/lib/http/csrf";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { recordSourceExtractionFailure, submitKnowledgeSource } from "@/lib/knowledge/submissions";
import { extractPdfSource, extractTextSource, extractUrlSource } from "@/lib/knowledge/source-extract";

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
    extracted = upload instanceof File && upload.size > 0 ? await extractPdfSource(upload)
      : sourceUrl ? await extractUrlSource(sourceUrl) : await extractTextSource(manualContent);
  } catch (error) {
    if (title && title.length <= 200) await recordSourceExtractionFailure({ actor: user, clientId: user.clientId,
      sourceType: upload instanceof File && upload.size > 0 ? "pdf" : sourceUrl ? "url" : "text",
      title, error: errorToMessage(error) });
    return NextResponse.json({ error: errorToMessage(error) }, { status: 400 });
  }
  try {
    const resolvedTitle = title || (upload instanceof File && upload.size > 0 ? upload.name.replace(/\.pdf$/i, "") : "");
    await submitKnowledgeSource({ actor: user, clientId: user.clientId, sourceType: extracted.sourceType,
      title: resolvedTitle, description: String(form.get("description") ?? ""), content: extracted.content,
      sourceUrl: extracted.sourceUrl, outletName: String(form.get("outletName") ?? ""), metadata: extracted.metadata,
      requestKey: String(form.get("requestKey") ?? "") || undefined });
  } catch (error) {
    return NextResponse.json({ error: errorToMessage(error) }, { status: 400 });
  }
  return NextResponse.redirect(new URL("/client/knowledge?submitted=1", request.url), 303);
}

function errorToMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
