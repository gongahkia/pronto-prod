import { assertSameOrigin } from "@/lib/http/csrf";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { ingestKnowledgeSource } from "@/lib/knowledge/ingest";
import { parseKnowledgeUpload } from "@/lib/knowledge/parse-upload";
import { crawlWebsiteKnowledge } from "@/lib/knowledge/website";
import { canAccessClient } from "@/lib/rbac";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const user = await requireUser("operator");
  const form = await request.formData();
  const clientId = String(form.get("clientId") ?? "");
  const title = String(form.get("title") ?? "").trim();
  const manualContent = String(form.get("content") ?? "").trim();
  const websiteUrl = String(form.get("url") ?? "").trim();
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

  let parsedUpload: Awaited<ReturnType<typeof parseKnowledgeUpload>> | null = null;
  let crawledWebsite: Awaited<ReturnType<typeof crawlWebsiteKnowledge>> | null = null;
  try {
    parsedUpload =
      !websiteUrl && upload instanceof File && upload.size > 0
        ? await parseKnowledgeUpload(upload)
        : null;
    crawledWebsite = websiteUrl
      ? await crawlWebsiteKnowledge({
          url: websiteUrl,
          crawlDepth: parseOptionalInteger(form.get("crawlDepth")),
          maxPages: parseOptionalInteger(form.get("maxPages")),
        })
      : null;
  } catch (error) {
    return NextResponse.json({ error: errorToMessage(error) }, { status: 400 });
  }
  const content = crawledWebsite?.content ?? parsedUpload?.content ?? manualContent;
  const resolvedTitle = title || crawledWebsite?.title || parsedUpload?.title || "";

  if (!resolvedTitle || !content) {
    return NextResponse.json(
      { error: "Provide a title plus manual text, upload a supported file, or add a website URL." },
      { status: 400 },
    );
  }

  await ingestKnowledgeSource({
    clientId,
    title: resolvedTitle,
    sourceType: crawledWebsite ? "website" : parsedUpload?.sourceType ?? "manual",
    content,
    metadata:
      crawledWebsite?.metadata ??
      parsedUpload?.metadata ??
      { entryMode: "manual" },
    actorUserId: user.userId,
  });

  return NextResponse.redirect(new URL(returnTo, request.url), 303);
}

function safeOperatorReturnPath(value: string, fallback: string): string {
  return value.startsWith("/operator") && !value.startsWith("//") ? value : fallback;
}

function parseOptionalInteger(value: FormDataEntryValue | null): number | undefined {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function errorToMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
