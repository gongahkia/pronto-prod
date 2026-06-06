import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createClientAssistantChangeRequest } from "@/lib/client-assistant-requests";

export async function POST(request: Request) {
  const user = await requireUser("client");
  if (!user.clientId) {
    return NextResponse.json({ error: "Client user has no client." }, { status: 400 });
  }

  const form = await request.formData();
  const body = String(form.get("body") ?? "");
  if (!body.trim()) {
    return NextResponse.json({ error: "Request details are required." }, { status: 400 });
  }

  await createClientAssistantChangeRequest({
    clientId: user.clientId,
    actorUserId: user.userId,
    kind: String(form.get("kind") ?? "assistant_change"),
    body,
  });

  const returnTo = safeClientReturnPath(String(form.get("returnTo") ?? ""));
  return NextResponse.redirect(new URL(returnTo, request.url), 303);
}

function safeClientReturnPath(value: string): string {
  if (value.startsWith("/client") && !value.startsWith("//")) {
    return value;
  }
  return "/client/assistant";
}
