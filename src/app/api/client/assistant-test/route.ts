import { NextResponse } from "next/server";
import { runAssistantPreview } from "@/lib/agent/assistant-preview-service";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/http/csrf";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const actor = await requireUser("client");
  if (!actor.clientId) return NextResponse.json({ error: "Client assignment required." }, { status: 403 });
  try {
    const body = await request.json() as Record<string, unknown>;
    return NextResponse.json(await runAssistantPreview(actor.clientId, body));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Preview failed." }, { status: 400 });
  }
}
