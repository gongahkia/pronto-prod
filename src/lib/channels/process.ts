import { randomUUID } from "node:crypto";
import { query, transaction } from "@/lib/db";
import { createEscalation, runAgentForMessage } from "@/lib/agent/engine";
import { sendChannelText } from "@/lib/channels/dispatch";
import { getEscalationHoldingReply } from "@/lib/channels/escalation-handoff";
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
  outboundError?: string;
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
        on conflict (channel_id, external_message_id) do nothing
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
    const insertedMessage = message.rows[0];
    if (!insertedMessage) {
      const duplicate = await client.query<Message>(
        "select * from messages where channel_id = $1 and external_message_id = $2",
        [inbound.channelId, inbound.externalMessageId],
      );
      const duplicateMessage = duplicate.rows[0];
      if (!duplicateMessage) {
        throw new Error(
          `Duplicate message insert was skipped but no existing row was found: ${inbound.externalMessageId}`,
        );
      }
      return {
        conversation: conversation.rows[0],
        message: duplicateMessage,
        duplicate: true,
      };
    }

    return { conversation: conversation.rows[0], message: insertedMessage, duplicate: false };
  });

  if (created.duplicate) {
    return {
      duplicate: true,
      conversationId: created.message.conversation_id,
      messageId: created.message.id,
    };
  }

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

  let outboundError: string | undefined;
  if (result.action === "answered" && result.responseText && inbound.channelKind !== "console") {
    try {
      await sendChannelText({
        channelId: inbound.channelId,
        externalThreadId: inbound.externalThreadId,
        text: result.responseText,
      });
    } catch (error) {
      outboundError = errorToMessage(error);
      console.warn("Agent answer send failed after message processing.", error);
    }
  }

  if (result.action === "escalated" && result.escalationId) {
    if (inbound.channelKind === "whatsapp") {
      try {
        await sendEscalationHoldingReply({
          channel,
          inbound,
          conversationId: created.conversation.id,
          escalationId: result.escalationId,
          reasonCode: result.reasonCode,
        });
        await recordCustomerHandoffStatus(result.escalationId, "sent", null);
      } catch (error) {
        console.warn("Escalation holding reply failed; continuing owner notification.", error);
        await recordCustomerHandoffStatus(
          result.escalationId,
          "failed",
          errorToMessage(error),
        );
      }
    } else {
      await recordCustomerHandoffStatus(
        result.escalationId,
        "skipped",
        `No customer holding reply is configured for ${inbound.channelKind}.`,
      );
    }

    try {
      await notifyOwnerOfEscalation(result.escalationId);
    } catch (error) {
      console.warn("Owner notification failed after escalation.", error);
      await recordOwnerNotificationFailure(result.escalationId, error);
    }
  }

  return {
    duplicate: false,
    conversationId: created.conversation.id,
    messageId: created.message.id,
    responseText: result.responseText,
    action: result.action,
    reasonCode: result.reasonCode,
    outboundError,
  };
}

async function recordCustomerHandoffStatus(
  escalationId: string,
  status: "sent" | "skipped" | "failed",
  error: string | null,
): Promise<void> {
  await query(
    `
      update escalations
      set customer_handoff_status = $2,
          customer_handoff_error = $3
      where id = $1
    `,
    [escalationId, status, error],
  );
}

async function recordOwnerNotificationFailure(
  escalationId: string,
  error: unknown,
): Promise<void> {
  await query(
    `
      update escalations
      set owner_notification_status = 'failed',
          owner_notification_error = $2
      where id = $1
    `,
    [escalationId, errorToMessage(error)],
  );
}

function errorToMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function sendEscalationHoldingReply(input: {
  channel: Channel;
  inbound: NormalizedInboundMessage;
  conversationId: string;
  escalationId: string;
  reasonCode: string;
}): Promise<void> {
  const text = getEscalationHoldingReply(input.channel.settings);

  await sendChannelText({
    channelId: input.inbound.channelId,
    externalThreadId: input.inbound.externalThreadId,
    text,
  });

  await query(
    `
      insert into messages (conversation_id, client_id, channel_id, external_message_id, sender_role, body, metadata)
      values ($1, $2, $3, $4, 'agent', $5, $6)
    `,
    [
      input.conversationId,
      input.channel.client_id,
      input.inbound.channelId,
      `agent-handoff-${randomUUID()}`,
      text,
      {
        escalationId: input.escalationId,
        reasonCode: input.reasonCode,
        policy: "escalation_holding_reply",
        sentToCustomer: true,
      },
    ],
  );
}
