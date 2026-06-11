import { assertSameOrigin } from "@/lib/http/csrf";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { ingestKnowledgeSource } from "@/lib/knowledge/ingest";
import { parseKnowledgeUpload } from "@/lib/knowledge/parse-upload";
import { crawlWebsiteKnowledge } from "@/lib/knowledge/website";

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
  const websiteUrl = String(form.get("url") ?? "").trim();
  const upload = form.get("file");

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
    clientId: user.clientId,
    title: resolvedTitle,
    sourceType: crawledWebsite ? "website" : parsedUpload?.sourceType ?? "client_manual",
    content,
    metadata:
      crawledWebsite?.metadata ??
      parsedUpload?.metadata ??
      { entryMode: "client_manual" },
    actorUserId: user.userId,
  });

  return NextResponse.redirect(new URL("/client/knowledge", request.url), 303);
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
