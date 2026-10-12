import { assertSameOrigin } from "@/lib/http/csrf";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { recordSourceExtractionFailure, submitKnowledgeSource } from "@/lib/knowledge/submissions";
import { extractPdfSource, extractTextSource, extractUrlSource } from "@/lib/knowledge/source-extract";
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
  const returnTo = safeOperatorReturnPath(
    String(form.get("returnTo") ?? ""),
    `/operator/clients/${clientId}/knowledge`,
  );

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
    extracted = upload instanceof File && upload.size > 0 ? await extractPdfSource(upload)
      : sourceUrl ? await extractUrlSource(sourceUrl) : await extractTextSource(manualContent);
  } catch (error) {
    if (title && title.length <= 200) await recordSourceExtractionFailure({ actor: user, clientId,
      sourceType: upload instanceof File && upload.size > 0 ? "pdf" : sourceUrl ? "url" : "text",
      title, error: errorToMessage(error) });
    return NextResponse.json({ error: errorToMessage(error) }, { status: 400 });
  }
  try {
    await submitKnowledgeSource({ actor: user, clientId, sourceType: extracted.sourceType,
      title: title || (upload instanceof File && upload.size > 0 ? upload.name.replace(/\.pdf$/i, "") : ""),
      description: String(form.get("description") ?? ""), content: extracted.content,
      sourceUrl: extracted.sourceUrl, outletName: String(form.get("outletName") ?? ""), metadata: extracted.metadata,
      requestKey: String(form.get("requestKey") ?? "") || undefined });
  } catch (error) {
    return NextResponse.json({ error: errorToMessage(error) }, { status: 400 });
  }

  return NextResponse.redirect(new URL(returnTo, request.url), 303);
}

function safeOperatorReturnPath(value: string, fallback: string): string {
  return value.startsWith("/operator") && !value.startsWith("//") ? value : fallback;
}

function errorToMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
