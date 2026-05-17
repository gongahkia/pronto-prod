import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { ingestKnowledgeSource } from "@/lib/knowledge/ingest";

export async function POST(request: Request) {
  const user = await requireUser("operator");
  const form = await request.formData();
  const clientId = String(form.get("clientId") ?? "");
  const title = String(form.get("title") ?? "").trim();
  const content = String(form.get("content") ?? "").trim();

  if (!clientId || !title || !content) {
    return NextResponse.json(
      { error: "clientId, title, and content are required." },
      { status: 400 },
    );
  }

  await ingestKnowledgeSource({
    clientId,
    title,
    sourceType: "manual",
    content,
    actorUserId: user.userId,
  });

  return NextResponse.redirect(new URL(`/operator/clients/${clientId}`, request.url), 303);
}

