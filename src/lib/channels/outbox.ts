import type { Pool } from "pg";
import { sendChannelText } from "@/lib/channels/dispatch";
import { query } from "@/lib/db";

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
): Promise<OutboundFlushResult> {
  const claimed = await query<OutboundMessage>(
    `
      update outbound_messages
      set status = 'sending',
          attempt_count = attempt_count + 1,
          updated_at = now()
      where id = $1 and status in ('pending', 'failed')
      returning *
    `,
    [outboundMessageId],
  );
  const outbound = claimed.rows[0];
  if (!outbound) {
    return {
      status: "skipped",
      outboundMessageId,
      reason: "Outbound message is not pending or failed.",
    };
  }

  try {
    await sendChannelText({
      channelId: outbound.channel_id,
      externalThreadId: outbound.external_thread_id,
      text: outbound.body,
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
    return { status: "failed", outboundMessageId: outbound.id, error: message };
  }
}

function errorToMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
