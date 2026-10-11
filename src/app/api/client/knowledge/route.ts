import { assertSameOrigin } from "@/lib/http/csrf";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { stageKnowledge } from "@/lib/assistant-drafts";
import { parseKnowledgeUpload } from "@/lib/knowledge/parse-upload";

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
  const upload = form.get("file");

  let parsedUpload: Awaited<ReturnType<typeof parseKnowledgeUpload>> | null = null;
  try {
    parsedUpload =
      upload instanceof File && upload.size > 0
        ? await parseKnowledgeUpload(upload)
        : null;
  } catch (error) {
    return NextResponse.json({ error: errorToMessage(error) }, { status: 400 });
  }
  const content = parsedUpload?.content ?? manualContent;
  const resolvedTitle = title || parsedUpload?.title || "";

  if (!resolvedTitle || !content) {
    return NextResponse.json(
      { error: "Provide a title plus manual text or upload a supported file." },
      { status: 400 },
    );
  }

  await stageKnowledge({
    clientId: user.clientId,
    actorUserId: user.userId,
    action: "upsert",
    title: resolvedTitle,
    sourceType: parsedUpload?.sourceType ?? "client_manual",
    content,
    metadata:
      parsedUpload?.metadata ??
      { entryMode: "client_manual" },
  });

  return NextResponse.redirect(new URL("/client/knowledge?staged=1", request.url), 303);
}

function errorToMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
