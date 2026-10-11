import { query, transaction } from "@/lib/db";
import { createEscalation, runAgentForMessage } from "@/lib/agent/engine";
import { decryptChannelCredentials, usesLegacyPlaintextCredentials } from "@/lib/channels/credentials";
import { getEscalationHoldingReply } from "@/lib/channels/escalation-handoff";
import { claimInboundJob, failInboundJob, finishInboundJob, type InboundJob } from "@/lib/channels/inbox";
import { enqueueOutboundMessage } from "@/lib/channels/outbox";
import { notifyOwnerOfEscalation } from "@/lib/escalations";
import { logWarn } from "@/lib/logger";
import type { Channel, Conversation, Escalation, Message } from "@/lib/types";
import type { ReservationConnector } from "@/lib/reservations/types";

export async function processInboundJob(input: { jobId?: string; requestId?: string;
  reservationConnector?: ReservationConnector } = {}): Promise<
  { jobId: string; outcome: "answered" | "escalated" | "skipped" } | null
> {
  const job = await claimInboundJob({ jobId: input.jobId });
  if (!job) return null;
  try {
    const outcome = await execute(job, input.requestId, input.reservationConnector);
    await finishInboundJob(job, outcome === "skipped" ? "skipped" : "completed");
    return { jobId: job.id, outcome };
  } catch (error) {
    await failInboundJob(job, error);
    logWarn("inbox.job_failed", { jobId: job.id, clientId: job.client_id,
      attemptCount: job.attempt_count, error });
    throw error;
  }
}

async function execute(job: InboundJob, requestId?: string,
  reservationConnector?: ReservationConnector): Promise<"answered" | "escalated" | "skipped"> {
  const [channelResult, messageResult, conversationResult] = await Promise.all([
    query<Channel>("select * from channels where id = $1 and client_id = $2", [job.channel_id, job.client_id]),
    query<Message>("select * from messages where id = $1 and client_id = $2", [job.message_id, job.client_id]),
    query<Conversation>("select * from conversations where id = $1 and client_id = $2", [job.conversation_id, job.client_id]),
  ]);
  const channelRow = channelResult.rows[0];
  const message = messageResult.rows[0];
  const conversation = conversationResult.rows[0];
  if (!channelRow || !message || !conversation || message.conversation_id !== conversation.id ||
      channelRow.id !== message.channel_id || conversation.channel_id !== channelRow.id) {
    throw new Error("Inbound job has inconsistent tenant or conversation references.");
  }
  if (channelRow.status !== "active") return "skipped";
  if ((channelRow.kind === "whatsapp" || channelRow.kind === "instagram") &&
      usesLegacyPlaintextCredentials(channelRow)) {
    throw new Error("Meta channel credentials must be encrypted before processing.");
  }
  const channel = decryptChannelCredentials(channelRow);

  // Recover a model decision already persisted before a worker crash.
  const answer = await query<Message>(
    `select * from messages where client_id = $1 and conversation_id = $2 and sender_role = 'agent'
       and metadata->>'customerMessageId' = $3 and metadata->>'policy' is distinct from 'escalation_holding_reply'
     order by created_at limit 1`,
    [job.client_id, conversation.id, message.id],
  );
  if (answer.rows[0]) {
    await queueAnswer(job, conversation, answer.rows[0]);
    return "answered";
  }
  const priorEscalation = await query<Escalation>(
    "select * from escalations where client_id = $1 and message_id = $2 limit 1",
    [job.client_id, message.id],
  );
  if (priorEscalation.rows[0]) {
    await queueHandoff(job, channel, conversation, priorEscalation.rows[0]);
    return "escalated";
  }

  const active = await query<{ id: string }>(
    `select c.id from conversations c where c.id = $1 and c.client_id = $2 and c.status = 'active'
      and not exists (select 1 from escalations e where e.conversation_id = c.id and e.client_id = c.client_id
        and e.status in ('open', 'claimed'))`,
    [conversation.id, job.client_id],
  );
  if (!active.rows[0]) return "skipped";

  const unsupported = typeof message.metadata.unsupportedMediaType === "string"
    ? message.metadata.unsupportedMediaType : null;
  const result = unsupported
    ? await createEscalation({
        clientId: job.client_id, channelId: job.channel_id, conversationId: job.conversation_id,
        customerMessageId: message.id, customerMessage: message.body,
        reasonCode: "unsupported_media", reasonDetail: `Customer sent unsupported ${channel.kind} content.`,
        confidence: 1, requestId,
      })
    : await runAgentForMessage({
        clientId: job.client_id, channelId: job.channel_id, channelKind: channel.kind,
        conversationId: job.conversation_id, customerMessageId: message.id,
        customerMessage: message.body, requestId, reservationConnector,
      });

  if (result.action === "answered") {
    const recorded = await query<Message>(
      `select * from messages where client_id = $1 and conversation_id = $2 and sender_role = 'agent'
         and metadata->>'customerMessageId' = $3 order by created_at limit 1`,
      [job.client_id, conversation.id, message.id],
    );
    if (!recorded.rows[0]) throw new Error("Agent answer was not persisted.");
    await queueAnswer(job, conversation, recorded.rows[0]);
    return "answered";
  }
  if (!result.escalationId) throw new Error("Agent escalation was not persisted.");
  const escalation = await query<Escalation>(
    "select * from escalations where id = $1 and client_id = $2", [result.escalationId, job.client_id],
  );
  if (!escalation.rows[0]) throw new Error("Agent escalation record is missing.");
  await queueHandoff(job, channel, conversation, escalation.rows[0]);
  return "escalated";
}

async function queueAnswer(job: InboundJob, conversation: Conversation, answer: Message): Promise<void> {
  await transaction(async (db) => {
    const owner = await db.query<Conversation>(
      "select * from conversations where id = $1 and client_id = $2 for update",
      [conversation.id, job.client_id],
    );
    if (owner.rows[0]?.status !== "active") return;
    const open = await db.query<{ id: string }>(
      "select id from escalations where client_id = $1 and conversation_id = $2 and status in ('open', 'claimed') limit 1",
      [job.client_id, conversation.id],
    );
    if (open.rows[0]) return;
    const csatUrl = typeof answer.metadata.csatUrl === "string"
      ? `${answer.metadata.csatUrl}?messageId=${answer.id}` : null;
    await enqueueOutboundMessage(db, {
      clientId: job.client_id, channelId: job.channel_id, conversationId: conversation.id,
      externalThreadId: conversation.external_thread_id,
      body: csatUrl && process.env.PRONTO_DISABLE_CSAT_HOOK !== "1"
        ? `${answer.body}\n\nRate this reply: ${csatUrl}` : answer.body,
      idempotencyKey: `agent-answer:${job.message_id}`,
      metadata: { purpose: "agent_answer", customerMessageId: job.message_id,
        agentMessageId: answer.id, reasonCode: answer.metadata.reasonCode },
    });
  }, { isolationLevel: "serializable", retries: 2 });
}

async function queueHandoff(
  job: InboundJob, channel: Channel, conversation: Conversation, escalation: Escalation,
): Promise<void> {
  const body = getEscalationHoldingReply(channel.settings);
  await transaction(async (db) => {
    await db.query(
      `insert into messages (conversation_id, client_id, channel_id, external_message_id, sender_role, body, metadata)
       values ($1, $2, $3, $4, 'agent', $5, $6)
       on conflict (channel_id, external_message_id) do nothing`,
      [conversation.id, job.client_id, channel.id, `agent-handoff-${escalation.id}`, body,
        { escalationId: escalation.id, customerMessageId: job.message_id, policy: "escalation_holding_reply" }],
    );
    await enqueueOutboundMessage(db, {
      clientId: job.client_id, channelId: channel.id, conversationId: conversation.id,
      escalationId: escalation.id, externalThreadId: conversation.external_thread_id, body,
      idempotencyKey: `escalation-holding:${escalation.id}`,
      metadata: { purpose: "escalation_holding_reply", customerMessageId: job.message_id },
    });
  }, { isolationLevel: "serializable", retries: 2 });
  if (escalation.owner_notification_status === "pending") {
    try {
      await notifyOwnerOfEscalation(escalation.id, job.client_id);
    } catch (error) {
      logWarn("owner_notification_failed", { escalationId: escalation.id, clientId: job.client_id, error });
    }
  }
}
