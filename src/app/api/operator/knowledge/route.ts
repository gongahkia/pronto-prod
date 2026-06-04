import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { ingestKnowledgeSource } from "@/lib/knowledge/ingest";
import { parseKnowledgeUpload } from "@/lib/knowledge/parse-upload";

export async function POST(request: Request) {
  const user = await requireUser("operator");
  const form = await request.formData();
  const clientId = String(form.get("clientId") ?? "");
  const title = String(form.get("title") ?? "").trim();
  const manualContent = String(form.get("content") ?? "").trim();
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

  const parsedUpload =
    upload instanceof File && upload.size > 0 ? await parseKnowledgeUpload(upload) : null;
  const content = parsedUpload?.content ?? manualContent;
  const resolvedTitle = title || parsedUpload?.title || "";

  if (!resolvedTitle || !content) {
    return NextResponse.json(
      { error: "Provide a title plus manual text, or upload a supported file." },
      { status: 400 },
    );
  }

  await ingestKnowledgeSource({
    clientId,
    title: resolvedTitle,
    sourceType: parsedUpload?.sourceType ?? "manual",
    content,
    metadata: parsedUpload?.metadata ?? { entryMode: "manual" },
    actorUserId: user.userId,
  });

  return NextResponse.redirect(new URL(returnTo, request.url), 303);
}

function safeOperatorReturnPath(value: string, fallback: string): string {
  return value.startsWith("/operator") && !value.startsWith("//") ? value : fallback;
}
