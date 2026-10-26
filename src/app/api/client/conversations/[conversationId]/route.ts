import { publicAppUrl } from "@/lib/http/redirect";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/http/csrf";
import { updateConversationAction } from "@/lib/conversation-actions";
import { DemoError } from "@/lib/customer-demo-boundary";
import { uuidPattern } from "@/lib/customer-demo";
import { hasStaffCapability } from "@/lib/staff-permissions";

export async function POST(request: Request, context: { params: Promise<{ conversationId: string }> }) {
  const csrf = assertSameOrigin(request); if (csrf) return csrf;
  const actor = await getSessionUser();
  if (!actor) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });
  if (actor.role !== "client" || !actor.clientId || !await hasStaffCapability(actor, actor.clientId, "conversation.respond"))
    return NextResponse.json({ error: "Conversation response permission required." }, { status: 403 });
  const { conversationId } = await context.params;
  if (!uuidPattern.test(conversationId)) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  const form = await request.formData();
  const action = form.get("action");
  const urgency = form.get("urgency");
  if (action !== "takeover" && action !== "classify") return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  if (action === "classify" && urgency !== "short_term" && urgency !== "long_term")
    return NextResponse.json({ error: "Choose short-term or long-term urgency." }, { status: 400 });
  try {
    await updateConversationAction({ actor, clientId: actor.clientId, conversationId, action,
      ...(action === "classify" ? { ownerActionRequired: form.get("ownerActionRequired") === "true", urgency: urgency as "short_term" | "long_term" } : {}) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof DemoError ? error.message : "Conversation update failed." },
      { status: error instanceof DemoError ? error.status : 409 });
  }
  return NextResponse.redirect(publicAppUrl(`/client/conversations/${conversationId}`, request.url), 303);
}
