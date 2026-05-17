import { query, transaction } from "@/lib/db";
import { createEscalation, runAgentForMessage } from "@/lib/agent/engine";
import { sendChannelText } from "@/lib/channels/dispatch";
import { notifyOwnerOfEscalation } from "@/lib/escalations";
import type { NormalizedInboundMessage } from "@/lib/channels/types";
import type { Channel, Conversation, Message } from "@/lib/types";

export type ProcessedInboundMessage = {
  duplicate: boolean;
  conversationId?: string;
  messageId?: string;
  responseText?: string | null;
  action?: "answered" | "escalated";
  reasonCode?: string;
};

export async function processInboundMessage(
  inbound: NormalizedInboundMessage,
): Promise<ProcessedInboundMessage> {
  const channelResult = await query<Channel>(
    "select * from channels where id = $1",
    [inbound.channelId],
  );
  const channel = channelResult.rows[0];
  if (!channel) {
    throw new Error(`Channel not found: ${inbound.channelId}`);
  }

  const existing = await query<Message>(
    "select * from messages where channel_id = $1 and external_message_id = $2",
    [inbound.channelId, inbound.externalMessageId],
  );
  if (existing.rowCount) {
    return { duplicate: true, messageId: existing.rows[0].id };
  }

  const created = await transaction(async (client) => {
    const conversation = await client.query<Conversation>(
      `
        insert into conversations (client_id, channel_id, external_thread_id, customer_name, customer_handle)
        values ($1, $2, $3, $4, $5)
        on conflict (channel_id, external_thread_id) do update set
          customer_name = coalesce(excluded.customer_name, conversations.customer_name),
          customer_handle = excluded.customer_handle,
          last_message_at = now()
        returning *
      `,
      [
        channel.client_id,
        inbound.channelId,
        inbound.externalThreadId,
        inbound.customerName ?? null,
        inbound.customerHandle,
      ],
    );

    const message = await client.query<Message>(
      `
        insert into messages (conversation_id, client_id, channel_id, external_message_id, sender_role, body, metadata)
        values ($1, $2, $3, $4, 'customer', $5, $6)
        returning *
      `,
      [
        conversation.rows[0].id,
        channel.client_id,
        inbound.channelId,
        inbound.externalMessageId,
        inbound.text,
        { raw: inbound.raw, channelKind: inbound.channelKind },
      ],
    );

    return { conversation: conversation.rows[0], message: message.rows[0] };
  });

  const result = inbound.unsupportedMediaType
    ? await createEscalation({
        clientId: channel.client_id,
        channelId: inbound.channelId,
        conversationId: created.conversation.id,
        customerMessageId: created.message.id,
        customerMessage: inbound.text,
        reasonCode: "unsupported_media",
        reasonDetail: `Customer sent unsupported ${inbound.channelKind} ${inbound.unsupportedMediaType} content.`,
        confidence: 1,
      })
    : await runAgentForMessage({
        clientId: channel.client_id,
        channelId: inbound.channelId,
        conversationId: created.conversation.id,
        customerMessageId: created.message.id,
        customerMessage: inbound.text,
      });

  if (result.action === "answered" && result.responseText && inbound.channelKind !== "console") {
    await sendChannelText({
      channelId: inbound.channelId,
      externalThreadId: inbound.externalThreadId,
      text: result.responseText,
    });
  }

  if (result.action === "escalated" && result.escalationId) {
    await notifyOwnerOfEscalation(result.escalationId);
  }

  return {
    duplicate: false,
    conversationId: created.conversation.id,
    messageId: created.message.id,
    responseText: result.responseText,
    action: result.action,
    reasonCode: result.reasonCode,
  };
}
