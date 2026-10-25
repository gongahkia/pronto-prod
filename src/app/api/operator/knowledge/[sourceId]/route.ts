import { assertSameOrigin } from "@/lib/http/csrf";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { stageKnowledge } from "@/lib/assistant-drafts";
import { canAccessClient } from "@/lib/rbac";

type Context = {
  params: Promise<{ sourceId: string }>;
};

export async function POST(request: Request, context: Context) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const user = await requireUser("operator");
  const { sourceId } = await context.params;
  const form = await request.formData();
  const action = String(form.get("action") ?? "");
  const clientId = String(form.get("clientId") ?? "");

  if (!clientId) {
    return NextResponse.json({ error: "clientId is required." }, { status: 400 });
  }
  if (!canAccessClient(user, clientId)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (action === "delete") {
    try { await stageKnowledge({ sourceId, clientId, actorUserId: user.userId, action: "delete" }); }
    catch (error) { return stageError(error); }
    return NextResponse.json({ ok: true, clientId });
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

    try { await stageKnowledge({ sourceId, clientId, title, content,
      actorUserId: user.userId, action: "upsert" }); }
    catch (error) { return stageError(error); }

    return NextResponse.json({ ok: true, clientId });
  }

  return NextResponse.json({ error: "Unsupported knowledge action." }, { status: 400 });
}

function stageError(error: unknown) {
  const message = error instanceof Error ? error.message : "Could not stage knowledge.";
  return NextResponse.json({ error: message }, { status: message === "Knowledge source not found." ? 404 : 400 });
}
