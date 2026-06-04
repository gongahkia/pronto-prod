import { query } from "@/lib/db";
import type { Client, Conversation } from "@/lib/types";

export type CsatConversationContext = {
  conversation: Conversation;
  client: Client;
};

export async function getCsatConversationContext(
  conversationId: string,
): Promise<CsatConversationContext | null> {
  const result = await query<CsatConversationContext>(
    `
      select
        to_jsonb(c.*) as conversation,
        to_jsonb(cl.*) as client
      from conversations c
      join clients cl on cl.id = c.client_id
      where c.id = $1
    `,
    [conversationId],
  );
  return result.rows[0] ?? null;
}

export async function recordCsatResponse(input: {
  conversationId: string;
  messageId?: string | null;
  score: number;
  comment?: string | null;
}): Promise<boolean> {
  const context = await getCsatConversationContext(input.conversationId);
  if (!context) {
    return false;
  }
  await query(
    `
      insert into csat_responses (
        client_id,
        conversation_id,
        message_id,
        score,
        comment
      )
      values ($1, $2, $3, $4, $5)
    `,
    [
      context.conversation.client_id,
      input.conversationId,
      input.messageId ?? null,
      input.score,
      input.comment?.trim() || null,
    ],
  );
  await query(
    `
      insert into metric_events (client_id, event_type, value, metadata)
      values ($1, 'csat_submitted', $2, $3)
    `,
    [
      context.conversation.client_id,
      input.score,
      {
        conversationId: input.conversationId,
        messageId: input.messageId ?? null,
      },
    ],
  );
  return true;
}
