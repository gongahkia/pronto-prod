import type { Pool } from "pg";
import { sendChannelText } from "@/lib/channels/dispatch";
import { policyFromOutboundMetadata } from "@/lib/channels/policy";
import { query } from "@/lib/db";
import { recordErrorEvent } from "@/lib/error-tracking";
import { logInfo, logWarn, redactErrorMessage } from "@/lib/logger";

type Queryable = Pick<Pool, "query">;

export type OutboundMessage = {
  id: string;
  client_id: string;
  conversation_id: string | null;
  escalation_id: string | null;
  channel_id: string;
  external_thread_id: string;
  body: string;
  status: "pending" | "sending" | "sent" | "failed";
  attempt_count: number;
  last_error: string | null;
  idempotency_key: string;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  sent_at: Date | null;
};

export type EnqueueOutboundInput = {
  clientId: string;
  conversationId?: string | null;
  escalationId?: string | null;
  channelId: string;
  externalThreadId: string;
  body: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
};

export type OutboundFlushResult =
  | { status: "sent"; outboundMessageId: string }
  | { status: "failed"; outboundMessageId: string; error: string }
  | { status: "skipped"; outboundMessageId: string; reason: string };

export type OutboundFlushOptions = {
  requestId?: string;
  staleSendingMinutes?: number;
  maxAttempts?: number;
};

export type OutboundRetryBatchInput = OutboundFlushOptions & {
  limit?: number;
};

export type OutboundRetryBatchResult = {
  attempted: number;
  sent: number;
  failed: number;
  skipped: number;
  results: OutboundFlushResult[];
};

const DEFAULT_STALE_SENDING_MINUTES = 10;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_RETRY_LIMIT = 25;

export async function enqueueOutboundMessage(
  db: Queryable,
  input: EnqueueOutboundInput,
): Promise<OutboundMessage> {
  const result = await db.query<OutboundMessage>(
    `
      insert into outbound_messages (
        client_id,
        conversation_id,
        escalation_id,
        channel_id,
        external_thread_id,
        body,
        idempotency_key,
        metadata
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8)
      on conflict (idempotency_key) do update set
        idempotency_key = excluded.idempotency_key
      returning *
    `,
    [
      input.clientId,
      input.conversationId ?? null,
      input.escalationId ?? null,
      input.channelId,
      input.externalThreadId,
      input.body,
      input.idempotencyKey,
      input.metadata ?? {},
    ],
  );

  return result.rows[0];
}

export async function flushOutboundMessage(
  outboundMessageId: string,
  options: OutboundFlushOptions = {},
): Promise<OutboundFlushResult> {
  const staleSendingMinutes = normalizePositiveInteger(
    options.staleSendingMinutes,
    DEFAULT_STALE_SENDING_MINUTES,
  );
  const maxAttempts = normalizePositiveInteger(
    options.maxAttempts,
    DEFAULT_MAX_ATTEMPTS,
  );
  const claimed = await query<OutboundMessage>(
    `
      update outbound_messages
      set status = 'sending',
          attempt_count = attempt_count + 1,
          updated_at = now()
      where id = $1
        and attempt_count < $3
        and (
          status in ('pending', 'failed')
          or (
            status = 'sending'
            and updated_at <= now() - make_interval(mins => $2::int)
          )
        )
      returning *
    `,
    [outboundMessageId, staleSendingMinutes, maxAttempts],
  );
  const outbound = claimed.rows[0];
  if (!outbound) {
    logInfo("outbox.flush_skipped", {
      requestId: options.requestId,
      outboundMessageId,
      reason: "not_retryable",
    });
    return {
      status: "skipped",
      outboundMessageId,
      reason: "Outbound message is not retryable.",
    };
  }

  logInfo("outbox.flush_claimed", {
    requestId: options.requestId,
    outboundMessageId: outbound.id,
    clientId: outbound.client_id,
    conversationId: outbound.conversation_id,
    escalationId: outbound.escalation_id,
    channelId: outbound.channel_id,
    attemptCount: outbound.attempt_count,
  });

  try {
    const policy = policyFromOutboundMetadata(outbound.metadata);
    await sendChannelText({
      channelId: outbound.channel_id,
      externalThreadId: outbound.external_thread_id,
      text: outbound.body,
      ...(policy ? { policy } : {}),
    });
    await query(
      `
        update outbound_messages
        set status = 'sent',
            sent_at = now(),
            last_error = null,
            updated_at = now()
        where id = $1
      `,
      [outbound.id],
    );
    logInfo("outbox.flush_sent", {
      requestId: options.requestId,
      outboundMessageId: outbound.id,
      clientId: outbound.client_id,
      conversationId: outbound.conversation_id,
      escalationId: outbound.escalation_id,
      channelId: outbound.channel_id,
      attemptCount: outbound.attempt_count,
    });
    return { status: "sent", outboundMessageId: outbound.id };
  } catch (error) {
    const message = errorToMessage(error);
    await query(
      `
        update outbound_messages
        set status = 'failed',
            last_error = $2,
            updated_at = now()
        where id = $1
      `,
      [outbound.id, message],
    );
    logWarn("outbox.flush_failed", {
      requestId: options.requestId,
      outboundMessageId: outbound.id,
      clientId: outbound.client_id,
      conversationId: outbound.conversation_id,
      escalationId: outbound.escalation_id,
      channelId: outbound.channel_id,
      attemptCount: outbound.attempt_count,
      error,
    });
    await recordErrorEvent({
      eventName: "outbox.flush_failed",
      source: "outbound",
      severity: outbound.attempt_count >= DEFAULT_MAX_ATTEMPTS ? "error" : "warning",
      requestId: options.requestId ?? null,
      clientId: outbound.client_id,
      channelId: outbound.channel_id,
      message,
      metadata: {
        outboundMessageId: outbound.id,
        conversationId: outbound.conversation_id,
        escalationId: outbound.escalation_id,
        attemptCount: outbound.attempt_count,
      },
    });
    return { status: "failed", outboundMessageId: outbound.id, error: message };
  }
}

export async function listRetryableOutboundMessages(
  input: OutboundRetryBatchInput = {},
): Promise<OutboundMessage[]> {
  const limit = normalizePositiveInteger(input.limit, DEFAULT_RETRY_LIMIT);
  const staleSendingMinutes = normalizePositiveInteger(
    input.staleSendingMinutes,
    DEFAULT_STALE_SENDING_MINUTES,
  );
  const maxAttempts = normalizePositiveInteger(
    input.maxAttempts,
    DEFAULT_MAX_ATTEMPTS,
  );

  const result = await query<OutboundMessage>(
    `
      select *
      from outbound_messages
      where attempt_count < $1
        and (
          status in ('pending', 'failed')
          or (
            status = 'sending'
            and updated_at <= now() - make_interval(mins => $2::int)
          )
        )
      order by updated_at asc
      limit $3
    `,
    [maxAttempts, staleSendingMinutes, limit],
  );

  return result.rows;
}

export async function flushRetryableOutboundMessages(
  input: OutboundRetryBatchInput = {},
): Promise<OutboundRetryBatchResult> {
  const messages = await listRetryableOutboundMessages(input);
  const results: OutboundFlushResult[] = [];

  logInfo("outbox.retry_batch_started", {
    requestId: input.requestId,
    retryableCount: messages.length,
    limit: input.limit ?? DEFAULT_RETRY_LIMIT,
  });

  for (const message of messages) {
    results.push(await flushOutboundMessage(message.id, input));
  }

  const summary = results.reduce(
    (accumulator, result) => ({
      attempted: accumulator.attempted + 1,
      sent: accumulator.sent + (result.status === "sent" ? 1 : 0),
      failed: accumulator.failed + (result.status === "failed" ? 1 : 0),
      skipped: accumulator.skipped + (result.status === "skipped" ? 1 : 0),
    }),
    { attempted: 0, sent: 0, failed: 0, skipped: 0 },
  );

  logInfo("outbox.retry_batch_completed", {
    requestId: input.requestId,
    ...summary,
  });

  return {
    ...summary,
    results,
  };
}

function errorToMessage(error: unknown): string {
  return redactErrorMessage(error);
}

function normalizePositiveInteger(
  value: number | undefined,
  fallback: number,
): number {
  if (!Number.isInteger(value) || !value || value < 1) {
    return fallback;
  }
  return value;
}
