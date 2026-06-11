import { assertSameOrigin } from "@/lib/http/csrf";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  flowResponse,
  saveTriageFlowForClient,
} from "@/lib/triage-flow-store";
import { TriageFlowValidationError } from "@/lib/triage-flow";
import { canAccessClient } from "@/lib/rbac";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const user = await requireUser("operator");
  const body = await parseJson(request);
  if (!body) {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
  if (!clientId) {
    return NextResponse.json({ error: "clientId is required." }, { status: 400 });
  }
  if (!canAccessClient(user, clientId)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const saved = await saveTriageFlowForClient({
      clientId,
      actorUserId: user.userId,
      nodes: body.nodes,
      edges: body.edges,
      source: "operator",
    });

    if (!saved) {
      return NextResponse.json({ error: "Agent config not found." }, { status: 404 });
    }

    return NextResponse.json({ flow: flowResponse(saved) });
  } catch (error) {
    if (error instanceof TriageFlowValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

async function parseJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const parsed = await request.json();
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
