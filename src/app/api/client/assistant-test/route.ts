import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { previewAgentReply, type AgentPreviewMessage } from "@/lib/agent/preview";
import { getAssistantDraft, markAssistantDraftTested } from "@/lib/assistant-drafts";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { assertSameOrigin } from "@/lib/http/csrf";
import type { Channel } from "@/lib/types";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const user = await requireUser("client");
  if (!user.clientId) {
    return NextResponse.json({ error: "Client user has no client." }, { status: 400 });
  }

  const body = await parseJson(request);
  if (!body) {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const channelId = typeof body.channelId === "string" ? body.channelId : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!channelId) {
    return NextResponse.json({ error: "Channel is required." }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }

  const channel = channelId === "preview"
    ? {
        id: "preview", client_id: user.clientId, kind: "whatsapp" as const,
        name: "General preview", status: "draft" as const, external_id: null,
        credentials: {}, settings: {}, last_health_check_at: null,
        last_health_status: null, last_health_error: null, last_outbound_at: null,
        last_outbound_error: null,
      }
    : (await query<Channel>(
        "select * from channels where id = $1 and client_id = $2 and status <> 'disabled'",
        [channelId, user.clientId],
      )).rows[0];
  if (!channel) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }

  const draft = await getAssistantDraft(user.clientId);
  const result = await previewAgentReply({
    clientId: user.clientId,
    channel,
    customerMessage: message,
    history: parseHistory(body.history),
    requestId: `assistant-test-${randomUUID()}`,
    draft,
  });
  if (draft) await markAssistantDraftTested(user.clientId, draft.edit_version);

  return NextResponse.json({
    action: result.action,
    responseText: result.responseText,
    reasonCode: result.reasonCode,
    reasonDetail: result.reasonDetail,
    confidence: result.confidence,
    citedChunks: result.citedChunks.map((chunk) => ({
      id: chunk.id,
      sourceId: chunk.source_id,
      score: chunk.score ?? null,
      preview: chunk.content.slice(0, 240),
    })),
    previewMode: draft ? "draft" : "live",
  });
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

function parseHistory(value: unknown): AgentPreviewMessage[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-12).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const senderRole = record.senderRole;
    const body = record.body;
    if ((senderRole !== "customer" && senderRole !== "agent") || typeof body !== "string") {
      return [];
    }
    const trimmed = body.trim();
    return trimmed ? [{ senderRole, body: trimmed }] : [];
  });
}
