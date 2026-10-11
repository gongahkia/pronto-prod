import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { discardAssistantDraft, stageFlow, stageVoice, type VoiceDraft } from "@/lib/assistant-drafts";
import { assertSameOrigin } from "@/lib/http/csrf";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const user = await requireUser("client");
  if (!user.clientId) return NextResponse.json({ error: "Client workspace missing." }, { status: 400 });
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Valid JSON is required." }, { status: 400 });
  }
  try {
    if (body.action === "voice") {
      await stageVoice({ clientId: user.clientId, actorUserId: user.userId, voice: body.voice as VoiceDraft });
    } else if (body.action === "flow") {
      await stageFlow({ clientId: user.clientId, actorUserId: user.userId, nodes: body.nodes, edges: body.edges });
    } else if (body.action === "discard") {
      await discardAssistantDraft(user.clientId, user.userId);
    } else {
      return NextResponse.json({ error: "Unsupported draft action." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save draft." }, { status: 400 });
  }
}
