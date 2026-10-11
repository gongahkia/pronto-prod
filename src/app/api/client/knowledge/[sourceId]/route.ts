import { assertSameOrigin } from "@/lib/http/csrf";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { stageKnowledge } from "@/lib/assistant-drafts";

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

  if (action === "delete") {
    try {
      await stageKnowledge({
        sourceId,
        clientId: user.clientId,
        actorUserId: user.userId,
        action: "delete",
      });
    } catch (error) {
      return knowledgeStageError(error);
    }
    return NextResponse.redirect(new URL("/client/knowledge?staged=1", request.url), 303);
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
      await stageKnowledge({
        sourceId,
        clientId: user.clientId,
        title,
        content,
        actorUserId: user.userId,
        action: "upsert",
      });
    } catch (error) {
      return knowledgeStageError(error);
    }

    return NextResponse.redirect(
      new URL(`/client/knowledge/${sourceId}?staged=1`, request.url),
      303,
    );
  }

  return NextResponse.json({ error: "Unsupported knowledge action." }, { status: 400 });
}

function knowledgeStageError(error: unknown) {
  const message = error instanceof Error ? error.message : "Could not save knowledge draft.";
  return NextResponse.json({ error: message }, { status: message === "Knowledge source not found." ? 404 : 400 });
}
