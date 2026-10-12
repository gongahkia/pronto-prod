import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/http/csrf";
import { approveConfiguration } from "@/lib/managed-approvals";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const actor = await requireUser("client");
  if (!actor.clientId) return NextResponse.json({ error: "Client assignment required." }, { status: 403 });
  const form = await request.formData();
  const kind = String(form.get("kind") ?? "");
  if (kind !== "assistant" && kind !== "channel")
    return NextResponse.json({ error: "Unsupported approval type." }, { status: 400 });
  const targetId = kind === "assistant" ? actor.clientId : String(form.get("targetId") ?? "");
  try {
    await approveConfiguration({ actor, clientId: actor.clientId, kind, targetId,
      revision: String(form.get("revision") ?? ""), evidence: String(form.get("evidence") ?? "") });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Approval failed." }, { status: 403 });
  }
  return NextResponse.redirect(new URL(kind === "assistant" ? "/client/knowledge" : "/client/channels", request.url), 303);
}
