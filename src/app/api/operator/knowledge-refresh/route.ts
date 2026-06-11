import { assertSameOrigin } from "@/lib/http/csrf";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  createKnowledgeRefreshRequest,
  resolveKnowledgeRefreshRequest,
} from "@/lib/knowledge/refresh";
import { canAccessClient } from "@/lib/rbac";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const user = await requireUser("operator");
  const form = await request.formData();
  const action = String(form.get("action") ?? "");
  const clientId = String(form.get("clientId") ?? "");

  if (!clientId) {
    return NextResponse.json({ error: "Client ID is required." }, { status: 400 });
  }
  if (!canAccessClient(user, clientId)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (action === "create") {
    await createKnowledgeRefreshRequest({
      clientId,
      actorUserId: user.userId,
      notes: String(form.get("notes") ?? ""),
    });
    return NextResponse.redirect(
      new URL(`/operator/clients/${clientId}/knowledge`, request.url),
      303,
    );
  }

  if (action === "resolve") {
    const status = String(form.get("status") ?? "");
    if (status !== "completed" && status !== "skipped") {
      return NextResponse.json({ error: "Invalid refresh status." }, { status: 400 });
    }
    const updated = await resolveKnowledgeRefreshRequest({
      requestId: String(form.get("requestId") ?? ""),
      clientId,
      actorUserId: user.userId,
      status,
    });
    if (!updated) {
      return NextResponse.json({ error: "Refresh request not found." }, { status: 404 });
    }
    return NextResponse.redirect(
      new URL(`/operator/clients/${clientId}/knowledge`, request.url),
      303,
    );
  }

  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}
