import { assertSameOrigin } from "@/lib/http/csrf";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getKnowledgeSourceForClient } from "@/lib/knowledge/manage";
import { submitKnowledgeSource } from "@/lib/knowledge/submissions";

type Context = {
  params: Promise<{ sourceId: string }>;
};

export async function POST(request: Request, context: Context) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const user = await requireUser("client");
  if (!user.clientId) {
    return NextResponse.json({ error: "Client user has no client." }, { status: 400 });
  }

  const { sourceId } = await context.params;
  const form = await request.formData();
  const action = String(form.get("action") ?? "");
  const existing = await getKnowledgeSourceForClient(sourceId, user.clientId);
  if (!existing) return NextResponse.json({ error: "Business knowledge source not found." }, { status: 404 });

  if (action === "delete") {
    try {
      await submitKnowledgeSource({ actor: user, clientId: user.clientId, targetSourceId: sourceId,
        action: "archive", sourceType: "text", title: existing.title, content: "Archived after review." });
    } catch (error) {
      return knowledgeStageError(error);
    }
    return NextResponse.redirect(new URL("/client/knowledge?submitted=1", request.url), 303);
  }

  if (action === "update") {
    const title = String(form.get("title") ?? "").trim();
    const content = String(form.get("content") ?? "").trim();
    if (!title || !content) {
      return NextResponse.json(
        { error: "Title and content are required." },
        { status: 400 },
      );
    }

    try {
      await submitKnowledgeSource({ actor: user, clientId: user.clientId, targetSourceId: sourceId,
        sourceType: "text", title, content, description: "Replacement of published source." });
    } catch (error) {
      return knowledgeStageError(error);
    }

    return NextResponse.redirect(
      new URL(`/client/knowledge/${sourceId}?submitted=1`, request.url),
      303,
    );
  }

  return NextResponse.json({ error: "Unsupported knowledge action." }, { status: 400 });
}

function knowledgeStageError(error: unknown) {
  const message = error instanceof Error ? error.message : "Could not save knowledge draft.";
  return NextResponse.json({ error: message }, { status: message === "Knowledge source not found." ? 404 : 400 });
}
