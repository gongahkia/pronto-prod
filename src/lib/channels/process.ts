import { randomUUID } from "node:crypto";
import { query, transaction } from "@/lib/db";
import { createEscalation, runAgentForMessage } from "@/lib/agent/engine";
import { sendChannelText } from "@/lib/channels/dispatch";
import { getEscalationHoldingReply } from "@/lib/channels/escalation-handoff";
import { notifyOwnerOfEscalation } from "@/lib/escalations";
import { logInfo, logWarn, redactErrorMessage } from "@/lib/logger";
import type { NormalizedInboundMessage } from "@/lib/channels/types";
import type { Channel, Conversation, Message } from "@/lib/types";

export type ProcessedInboundMessage = {
  duplicate: boolean;
  conversationId?: string;
  messageId?: string;
  responseText?: string | null;
  action?: "answered" | "escalated";
  reasonCode?: string;
  csatUrl?: string;
  outboundError?: string;
};

export async function processInboundMessage(
  inbound: NormalizedInboundMessage,
  options: { requestId?: string; clientId?: string } = {},
): Promise<ProcessedInboundMessage> {
  logInfo("inbound_message.received", {
    requestId: options.requestId,
    channelId: inbound.channelId,
    channelKind: inbound.channelKind,
    externalMessageId: inbound.externalMessageId,
    unsupportedMediaType: inbound.unsupportedMediaType,
  });

  const channelResult = await query<Channel>(
    options.clientId
      ? "select * from channels where id = $1 and client_id = $2"
      : "select * from channels where id = $1",
    options.clientId ? [inbound.channelId, options.clientId] : [inbound.channelId],
  );
  const channel = channelResult.rows[0];
  if (!channel) {
    throw new Error(`Channel not found: ${inbound.channelId}`);
  }

  const existing = await query<Message>(
    "select * from messages where channel_id = $1 and external_message_id = $2 and client_id = $3",
    [inbound.channelId, inbound.externalMessageId, channel.client_id],
  );
  if (existing.rowCount) {
    logInfo("inbound_message.duplicate", {
      requestId: options.requestId,
      channelId: inbound.channelId,
      channelKind: inbound.channelKind,
      externalMessageId: inbound.externalMessageId,
      messageId: existing.rows[0].id,
    });
    return { duplicate: true, messageId: existing.rows[0].id };
  }

  const created = await transaction(async (client) => {
    const conversation = await client.query<Conversation>(
      `
        insert into conversations (client_id, channel_id, external_thread_id, customer_name, customer_handle)
        values ($1, $2, $3, $4, $5)
        on conflict (channel_id, external_thread_id) where deleted_at is null do update set
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
        "select * from messages where channel_id = $1 and external_message_id = $2 and client_id = $3",
        [inbound.channelId, inbound.externalMessageId, channel.client_id],
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
  }, { isolationLevel: "serializable", retries: 2 });

  if (created.duplicate) {
    logInfo("inbound_message.concurrent_duplicate", {
      requestId: options.requestId,
      channelId: inbound.channelId,
      channelKind: inbound.channelKind,
      externalMessageId: inbound.externalMessageId,
      conversationId: created.message.conversation_id,
      messageId: created.message.id,
    });
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
        requestId: options.requestId,
      })
    : await runAgentForMessage({
        clientId: channel.client_id,
        channelId: inbound.channelId,
        conversationId: created.conversation.id,
        customerMessageId: created.message.id,
        customerMessage: inbound.text,
        requestId: options.requestId,
      });

  let outboundError: string | undefined;
  if (result.action === "answered" && result.responseText && inbound.channelKind !== "console") {
    try {
      await sendChannelText({
        channelId: inbound.channelId,
        externalThreadId: inbound.externalThreadId,
        text: appendCsatLink(result.responseText, result.csatUrl),
      });
    } catch (error) {
      outboundError = errorToMessage(error);
      logWarn("agent_answer_send_failed", {
        requestId: options.requestId,
        channelId: inbound.channelId,
        conversationId: created.conversation.id,
        externalMessageId: inbound.externalMessageId,
        error,
      });
    }
  }

  if (result.action === "escalated" && result.escalationId) {
    if (inbound.channelKind !== "console") {
      try {
        await sendEscalationHoldingReply({
          channel,
          inbound,
          conversationId: created.conversation.id,
          escalationId: result.escalationId,
          reasonCode: result.reasonCode,
          requestId: options.requestId,
        });
        await recordCustomerHandoffStatus(result.escalationId, channel.client_id, "sent", null);
      } catch (error) {
        logWarn("escalation_holding_reply_failed", {
          requestId: options.requestId,
          channelId: inbound.channelId,
          escalationId: result.escalationId,
          externalMessageId: inbound.externalMessageId,
          error,
        });
        await recordCustomerHandoffStatus(
          result.escalationId,
          channel.client_id,
          "failed",
          errorToMessage(error),
        );
      }
    } else {
      await recordCustomerHandoffStatus(
        result.escalationId,
        channel.client_id,
        "skipped",
        `No customer holding reply is configured for ${inbound.channelKind}.`,
      );
    }

    try {
      await notifyOwnerOfEscalation(result.escalationId, channel.client_id);
    } catch (error) {
      logWarn("owner_notification_failed", {
        requestId: options.requestId,
        escalationId: result.escalationId,
        error,
      });
      await recordOwnerNotificationFailure(result.escalationId, channel.client_id, error);
    }
  }

  return {
    duplicate: false,
    conversationId: created.conversation.id,
    messageId: created.message.id,
    responseText: result.responseText,
    action: result.action,
    reasonCode: result.reasonCode,
    csatUrl: result.csatUrl,
    outboundError,
  };
}

function appendCsatLink(responseText: string, csatUrl: string | undefined): string {
  if (!csatUrl || process.env.PRONTO_DISABLE_CSAT_HOOK === "1") {
    return responseText;
  }
  return `${responseText}\n\nRate this reply: ${csatUrl}`;
}

async function recordCustomerHandoffStatus(
  escalationId: string,
  clientId: string,
  status: "sent" | "skipped" | "failed",
  error: string | null,
): Promise<void> {
  await query(
    `
      update escalations
      set customer_handoff_status = $2,
          customer_handoff_error = $3
      where id = $1 and client_id = $4
    `,
    [escalationId, status, error, clientId],
  );
}

async function recordOwnerNotificationFailure(
  escalationId: string,
  clientId: string,
  error: unknown,
): Promise<void> {
  await query(
    `
      update escalations
      set owner_notification_status = 'failed',
          owner_notification_error = $2
      where id = $1 and client_id = $3
    `,
    [escalationId, errorToMessage(error), clientId],
  );
}

function errorToMessage(error: unknown): string {
  return redactErrorMessage(error);
}

async function sendEscalationHoldingReply(input: {
  channel: Channel;
  inbound: NormalizedInboundMessage;
  conversationId: string;
  escalationId: string;
  reasonCode: string;
  requestId?: string;
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
        requestId: input.requestId,
        escalationId: input.escalationId,
        reasonCode: input.reasonCode,
        policy: "escalation_holding_reply",
        sentToCustomer: true,
      },
    ],
  );
}
