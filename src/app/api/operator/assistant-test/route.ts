import { NextResponse } from "next/server";
import { runAssistantPreview } from "@/lib/agent/assistant-preview-service";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/http/csrf";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  await requireUser("operator");
  try {
    const body = await request.json() as Record<string, unknown>;
    const clientId = typeof body.clientId === "string" ? body.clientId : "";
    if (!clientId) return NextResponse.json({ error: "Business is required." }, { status: 400 });
    return NextResponse.json(await runAssistantPreview(clientId, body));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Preview failed." }, { status: 400 });
  }
}
