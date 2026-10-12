import { randomUUID } from "node:crypto";
import { previewAgentReply, type AgentPreviewMessage } from "@/lib/agent/preview";
import { getAssistantDraft, markAssistantDraftTested } from "@/lib/assistant-drafts";
import { query } from "@/lib/db";
import type { Channel } from "@/lib/types";

export async function runAssistantPreview(clientId: string, body: Record<string, unknown>) {
  const channelId = typeof body.channelId === "string" ? body.channelId : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!channelId || !message) throw new Error("Channel and customer question are required.");
  const channel = channelId === "preview"
    ? { id: "preview", client_id: clientId, kind: "whatsapp" as const,
        name: "General preview", status: "draft" as const, external_id: null,
        credentials: {}, settings: {}, last_health_check_at: null,
        last_health_status: null, last_health_error: null, last_outbound_at: null,
        last_outbound_error: null }
    : (await query<Channel>(
        "select * from channels where id = $1 and client_id = $2 and status <> 'disabled'",
        [channelId, clientId])).rows[0];
  if (!channel) throw new Error("Channel not found for this business.");
  const draft = await getAssistantDraft(clientId);
  const result = await previewAgentReply({ clientId, channel, customerMessage: message,
    history: parseHistory(body.history), requestId: `assistant-test-${randomUUID()}`, draft });
  if (draft) await markAssistantDraftTested(clientId, draft.edit_version);
  return { action: result.action, responseText: result.responseText,
    reasonCode: result.reasonCode, reasonDetail: result.reasonDetail, confidence: result.confidence,
    citedChunks: result.citedChunks.map((chunk) => ({ id: chunk.id, sourceId: chunk.source_id,
      score: chunk.score ?? null, preview: chunk.content.slice(0, 240) })),
    previewMode: draft ? "draft" : "live" };
}

function parseHistory(value: unknown): AgentPreviewMessage[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-12).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if ((record.senderRole !== "customer" && record.senderRole !== "agent") || typeof record.body !== "string") return [];
    const trimmed = record.body.trim();
    return trimmed ? [{ senderRole: record.senderRole, body: trimmed }] as AgentPreviewMessage[] : [];
  });
}
