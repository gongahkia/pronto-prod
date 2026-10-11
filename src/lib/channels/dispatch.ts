import { query } from "@/lib/db";
import { logWarn } from "@/lib/logger";
import { decryptChannelCredentials, usesLegacyPlaintextCredentials } from "@/lib/channels/credentials";
import { recordOutboundHealth } from "@/lib/channels/health";
import { ChannelPolicyError } from "@/lib/channels/provider-error";
import {
  assertChannelSendAllowed,
  type ChannelSendPolicy,
} from "@/lib/channels/policy";
import { sendTelegramText } from "@/lib/channels/telegram";
import { sendWhatsAppText } from "@/lib/channels/whatsapp";
import { sendMessengerText } from "@/lib/channels/messenger";
import { sendInstagramText } from "@/lib/channels/instagram";
import { lookupReplyThreadingHints, sendEmail } from "@/lib/channels/email";
import type { Channel } from "@/lib/types";

export async function sendChannelText(input: {
  channelId: string;
  clientId?: string;
  externalThreadId: string;
  text: string;
  policy?: ChannelSendPolicy;
}): Promise<{ providerMessageId?: string }> {
  const channelResult = await query<Channel>(
    input.clientId
      ? "select * from channels where id = $1 and client_id = $2"
      : "select * from channels where id = $1",
    input.clientId ? [input.channelId, input.clientId] : [input.channelId],
  );
  const channel = channelResult.rows[0]
    ? decryptChannelCredentials(channelResult.rows[0])
    : undefined;
  if (!channel) {
    throw new Error(`Channel not found: ${input.channelId}`);
  }
  if (channel.status !== "active") {
    throw new Error("Channel is disabled or inactive; outbound send blocked.");
  }
  if ((channel.kind === "whatsapp" || channel.kind === "instagram") &&
      usesLegacyPlaintextCredentials(channelResult.rows[0])) {
    throw new Error("Meta channel credentials must be encrypted before activation.");
  }

  assertChannelSendAllowed(channel, input.policy);

  try {
    if (channel.kind === "whatsapp") {
      const template = input.policy?.whatsappTemplateName && input.policy.whatsappTemplateApproved === true
        ? { name: input.policy.whatsappTemplateName,
            languageCode: input.policy.whatsappTemplateLanguage ?? "en_US" } : undefined;
      if (!template && !(await hasRecentCustomerMessage(channel, input.externalThreadId))) {
        throw new ChannelPolicyError("WhatsApp text reply is outside the customer service window.");
      }
      const providerMessageId = await sendWhatsAppText({ channel,
        externalThreadId: input.externalThreadId, text: input.text, template });
      await safeRecordOutboundHealth(input.channelId, channel.client_id);
      return { providerMessageId };
    }

    if (channel.kind === "telegram") {
      await sendTelegramText({ channel, externalThreadId: input.externalThreadId, text: input.text });
      await safeRecordOutboundHealth(input.channelId, channel.client_id);
      return {};
    }

    if (channel.kind === "messenger") {
      await sendMessengerText({ channel, externalThreadId: input.externalThreadId, text: input.text });
      await safeRecordOutboundHealth(input.channelId, channel.client_id);
      return {};
    }

    if (channel.kind === "instagram") {
      if (!(await hasRecentCustomerMessage(channel, input.externalThreadId))) {
        throw new ChannelPolicyError("Instagram reply requires a recent customer-initiated conversation.");
      }
      const providerMessageId = await sendInstagramText({ channel,
        externalThreadId: input.externalThreadId, text: input.text });
      await safeRecordOutboundHealth(input.channelId, channel.client_id);
      return { providerMessageId };
    }

    if (channel.kind === "email") {
      const threading = await lookupReplyThreadingHints({
        channelId: channel.id,
        externalThreadId: input.externalThreadId,
      });
      const subjectSetting =
        (channel.settings.defaultSubject as string | undefined) ?? "your inquiry";
      const subject = threading.subject ?? subjectSetting;
      const { messageId } = await sendEmail({
        channel,
        to: threading.to,
        subject,
        text: input.text,
        inReplyTo: threading.inReplyTo,
        references: threading.references,
      });
      await query(
        `
          update messages
          set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{outgoingMessageId}', to_jsonb($4::text), true)
          where id = (
            select m.id
            from messages m
            join conversations c on c.id = m.conversation_id
            where c.channel_id = $1
              and c.external_thread_id = $2
              and m.client_id = $3
              and m.sender_role in ('agent', 'operator')
            order by m.created_at desc
            limit 1
          )
        `,
        [channel.id, input.externalThreadId, channel.client_id, messageId],
      );
      await safeRecordOutboundHealth(input.channelId, channel.client_id);
      return { providerMessageId: messageId };
    }
    throw new ChannelPolicyError("Unsupported outbound channel kind.");
  } catch (error) {
    await safeRecordOutboundHealth(input.channelId, channel.client_id, error);
    throw error;
  }
}

async function safeRecordOutboundHealth(channelId: string, clientId: string, error?: unknown): Promise<void> {
  try {
    await recordOutboundHealth(channelId, clientId, error);
  } catch (recordingError) {
    logWarn("channel.health_record_failed", { channelId, clientId, error: recordingError });
  }
}

async function hasRecentCustomerMessage(channel: Channel, externalThreadId: string): Promise<boolean> {
  const recent = await query<{ created_at: Date; metadata: Record<string, unknown> }>(
    `select m.created_at, m.metadata from messages m join conversations c on c.id = m.conversation_id
     where m.client_id = $1 and m.channel_id = $2 and c.external_thread_id = $3
       and c.client_id = $1 and m.sender_role = 'customer'
     order by m.created_at desc limit 1`,
    [channel.client_id, channel.id, externalThreadId],
  );
  const occurredAt = recent.rows[0]?.metadata.providerOccurredAt;
  // Meta's customer window is measured from the provider event, not when a
  // delayed or replayed webhook happened to reach our database.
  const age = typeof occurredAt === "string" && Number.isFinite(Date.parse(occurredAt))
    ? Date.now() - Date.parse(occurredAt) : Infinity;
  return age >= 0 && age < 24 * 60 * 60 * 1000;
}
