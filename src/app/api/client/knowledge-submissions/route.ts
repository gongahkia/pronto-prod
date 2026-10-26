import { publicAppUrl } from "@/lib/http/redirect";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/http/csrf";
import { reviewSourceSubmission, submitKnowledgeSource } from "@/lib/knowledge/submissions";
import { extractPdfSource, extractTextSource, extractUrlSource } from "@/lib/knowledge/source-extract";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const actor = await requireUser("client");
  if (!actor.clientId) return NextResponse.json({ error: "Business assignment required." }, { status: 403 });
  const form = await request.formData();
  const submissionId = String(form.get("submissionId") ?? "");
  const revision = Number(form.get("revision"));
  const action = String(form.get("action") ?? "");
  try {
    if (!submissionId || !Number.isInteger(revision) || revision < 1) throw new Error("Invalid source revision.");
    if (action === "approve" || action === "reject" || action === "request_revision") {
      await reviewSourceSubmission({ actor, clientId: actor.clientId, submissionId,
        expectedRevision: revision, decision: action, note: String(form.get("note") ?? "") });
    } else if (action === "revise") {
      const sourceType = String(form.get("sourceType"));
      const sourceAction = String(form.get("sourceAction"));
      const upload = form.get("file");
      const extracted = sourceAction === "archive" ? await extractTextSource("Archived after review.")
        : sourceType === "pdf" ? await extractPdfSource(upload as File)
        : sourceType === "url" ? await extractUrlSource(String(form.get("sourceUrl") ?? ""))
        : await extractTextSource(String(form.get("content") ?? ""));
      await submitKnowledgeSource({ actor, clientId: actor.clientId, submissionId,
        expectedRevision: revision, sourceType: sourceType as "text" | "pdf" | "url",
        action: sourceAction as "upsert" | "archive",
        title: String(form.get("title") ?? ""), content: extracted.content,
        description: String(form.get("description") ?? ""), sourceUrl: extracted.sourceUrl,
        metadata: extracted.metadata });
    } else throw new Error("Unsupported source action.");
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Source review failed." }, { status: 400 });
  }
  return NextResponse.redirect(publicAppUrl("/client/knowledge", request.url), 303);
}
