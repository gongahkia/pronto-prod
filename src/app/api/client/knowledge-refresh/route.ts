import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  createKnowledgeRefreshRequest,
  resolveKnowledgeRefreshRequest,
} from "@/lib/knowledge/refresh";

export async function POST(request: Request) {
  const user = await requireUser("client");
  if (!user.clientId) {
    return NextResponse.json({ error: "Client user has no client." }, { status: 400 });
  }

  const form = await request.formData();
  const action = String(form.get("action") ?? "");

  if (action === "create") {
    await createKnowledgeRefreshRequest({
      clientId: user.clientId,
      actorUserId: user.userId,
      notes: String(form.get("notes") ?? ""),
    });
    return NextResponse.redirect(new URL("/client/knowledge", request.url), 303);
  }

  if (action === "resolve") {
    const status = String(form.get("status") ?? "");
    if (status !== "completed" && status !== "skipped") {
      return NextResponse.json({ error: "Invalid refresh status." }, { status: 400 });
    }
    const updated = await resolveKnowledgeRefreshRequest({
      requestId: String(form.get("requestId") ?? ""),
      clientId: user.clientId,
      actorUserId: user.userId,
      status,
    });
    if (!updated) {
      return NextResponse.json({ error: "Refresh request not found." }, { status: 404 });
    }
    return NextResponse.redirect(new URL("/client/knowledge", request.url), 303);
  }

  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}
