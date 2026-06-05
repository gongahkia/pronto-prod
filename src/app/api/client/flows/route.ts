import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  flowResponse,
  saveTriageFlowForClient,
} from "@/lib/triage-flow-store";
import { TriageFlowValidationError } from "@/lib/triage-flow";

export async function POST(request: Request) {
  const user = await requireUser("client");
  if (!user.clientId) {
    return NextResponse.json({ error: "Client user has no client." }, { status: 400 });
  }

  const body = await parseJson(request);
  if (!body) {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  try {
    const saved = await saveTriageFlowForClient({
      clientId: user.clientId,
      actorUserId: user.userId,
      nodes: body.nodes,
      edges: body.edges,
      source: "client",
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
