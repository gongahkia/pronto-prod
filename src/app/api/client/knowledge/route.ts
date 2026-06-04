import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { ingestKnowledgeSource } from "@/lib/knowledge/ingest";
import { parseKnowledgeUpload } from "@/lib/knowledge/parse-upload";

export async function POST(request: Request) {
  const user = await requireUser("client");
  if (!user.clientId) {
    return NextResponse.json({ error: "Client user has no client." }, { status: 400 });
  }

  const form = await request.formData();
  const title = String(form.get("title") ?? "").trim();
  const manualContent = String(form.get("content") ?? "").trim();
  const upload = form.get("file");

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
    clientId: user.clientId,
    title: resolvedTitle,
    sourceType: parsedUpload?.sourceType ?? "client_manual",
    content,
    metadata: parsedUpload?.metadata ?? { entryMode: "client_manual" },
    actorUserId: user.userId,
  });

  return NextResponse.redirect(new URL("/client/knowledge", request.url), 303);
}
