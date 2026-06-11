import { assertSameOrigin } from "@/lib/http/csrf";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  deleteKnowledgeSourceForClient,
  updateKnowledgeSourceForClient,
} from "@/lib/knowledge/manage";

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
    const deleted = await deleteKnowledgeSourceForClient({
      sourceId,
      clientId: user.clientId,
      actorUserId: user.userId,
    });
    if (!deleted) {
      return NextResponse.json({ error: "Knowledge source not found." }, { status: 404 });
    }
    return NextResponse.redirect(new URL("/client/knowledge", request.url), 303);
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

    const updated = await updateKnowledgeSourceForClient({
      sourceId,
      clientId: user.clientId,
      title,
      content,
      actorUserId: user.userId,
    });
    if (!updated) {
      return NextResponse.json({ error: "Knowledge source not found." }, { status: 404 });
    }

    return NextResponse.redirect(
      new URL(`/client/knowledge/${sourceId}`, request.url),
      303,
    );
  }

  return NextResponse.json({ error: "Unsupported knowledge action." }, { status: 400 });
}
