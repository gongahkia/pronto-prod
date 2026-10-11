import { query } from "@/lib/db";
import { ingestInboundMessage, ingestInboundMessages } from "@/lib/channels/inbox";
import { processInboundJob } from "@/lib/channels/inbox-worker";
import type { NormalizedInboundMessage } from "@/lib/channels/types";
import type { Message } from "@/lib/types";

export type ProcessedInboundMessage = {
  duplicate: boolean;
  conversationId: string;
  messageId: string;
  responseText?: string | null;
  action?: "answered" | "escalated";
  reasonCode?: string;
  skipped?: boolean;
};

// Webhook routes call this ingestion entry point and return after the DB commit.
export async function processInboundMessages(
  messages: NormalizedInboundMessage[],
  context: { requestId?: string } = {},
) {
  void context;
  return ingestInboundMessages(messages);
}

// This synchronous helper is kept for local evaluation and tests. It uses the
// same durable job and claim path as the background worker.
export async function processInboundMessage(
  inbound: NormalizedInboundMessage,
  options: { requestId?: string; clientId?: string } = {},
): Promise<ProcessedInboundMessage> {
  const ingested = await ingestInboundMessage(inbound);
  if (options.clientId) {
    const owner = await query<{ client_id: string }>(
      "select client_id from inbound_jobs where id = $1 and client_id = $2",
      [ingested.jobId, options.clientId],
    );
    if (!owner.rows[0]) throw new Error("Inbound job belongs to another client.");
  }
  const processed = await processInboundJob({ jobId: ingested.jobId, requestId: options.requestId });
  const base: ProcessedInboundMessage = {
    duplicate: ingested.duplicate,
    conversationId: ingested.conversationId,
    messageId: ingested.messageId,
    skipped: processed?.outcome === "skipped",
  };
  if (processed?.outcome === "answered") {
    const answer = await query<Message>(
      `select * from messages where client_id = (select client_id from inbound_jobs where id = $1)
       and conversation_id = $2 and sender_role = 'agent'
       and metadata->>'customerMessageId' = $3 order by created_at limit 1`,
      [ingested.jobId, ingested.conversationId, ingested.messageId],
    );
    return { ...base, action: "answered", responseText: answer.rows[0]?.body ?? null,
      reasonCode: String(answer.rows[0]?.metadata.reasonCode ?? "recorded_answer") };
  }
  return processed?.outcome === "escalated" ? { ...base, action: "escalated" } : base;
}
