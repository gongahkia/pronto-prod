import { appBaseUrl } from "@/lib/env";
import { query } from "@/lib/db";
import { sendChannelText } from "@/lib/channels/dispatch";
import type { Channel, DeliveryStatus } from "@/lib/types";

type EscalationNotification = {
  id: string;
  reason_code: string;
  reason_detail: string;
  customer_message: string;
  client_id: string;
  conversation_id: string;
  customer_handle: string | null;
  business_profile: Record<string, unknown>;
};

export type OwnerNotificationResult = {
  status: DeliveryStatus;
  detail: string;
  channelId?: string;
  channelKind?: Channel["kind"];
  destination?: string;
};

export async function notifyOwnerOfEscalation(
  escalationId: string,
  clientId?: string,
): Promise<OwnerNotificationResult> {
  const escalationResult = await query<EscalationNotification>(
    `
      select
        e.id,
        e.reason_code,
        e.reason_detail,
        e.client_id,
        e.conversation_id,
        m.body as customer_message,
        c.customer_handle,
        cl.business_profile
      from escalations e
      join clients cl on cl.id = e.client_id
      join messages m on m.id = e.message_id
      join conversations c on c.id = e.conversation_id
      where e.id = $1
        ${clientId ? "and e.client_id = $2" : ""}
    `,
    clientId ? [escalationId, clientId] : [escalationId],
  );
  const escalation = escalationResult.rows[0];
  if (!escalation) {
    return {
      status: "skipped",
      detail: "Escalation not found.",
    };
  }

  const channelResult = await query<Channel>(
    `
      select * from channels
      where client_id = $1
        and status = 'active'
        and kind in ('telegram', 'whatsapp')
      order by case kind when 'telegram' then 0 else 1 end
    `,
    [escalation.client_id],
  );
  const channelSelection = selectOwnerNotificationChannel(
    channelResult.rows,
    escalation.business_profile,
  );
  if (!channelSelection) {
    return recordOwnerNotificationResult(escalation.id, escalation.client_id, {
      status: "skipped",
      detail: channelResult.rows.length
        ? "No owner notification destination configured."
        : "No active owner notification channel configured.",
    });
  }
  const { channel, destination } = channelSelection;

  const takeoverUrl = `${appBaseUrl()}/operator/clients/${escalation.client_id}/conversations/${escalation.conversation_id}`;
  const text = [
    "Pronto escalation",
    `Customer: ${escalation.customer_handle ?? "unknown"}`,
    `Question: ${escalation.customer_message}`,
    `Reason: ${escalation.reason_code} - ${escalation.reason_detail}`,
    `Take over: ${takeoverUrl}`,
  ].join("\n");

  try {
    await sendChannelText({
      channelId: channel.id,
      clientId: escalation.client_id,
      externalThreadId: destination,
      text,
    });
  } catch (error) {
    return recordOwnerNotificationResult(escalation.id, escalation.client_id, {
      status: "failed",
      detail: errorToMessage(error),
      channelId: channel.id,
      channelKind: channel.kind,
      destination,
    });
  }

  return recordOwnerNotificationResult(escalation.id, escalation.client_id, {
    status: "sent",
    detail: "Owner notification sent.",
    channelId: channel.id,
    channelKind: channel.kind,
    destination,
  });
}

function selectOwnerNotificationChannel(
  channels: Channel[],
  businessProfile: Record<string, unknown>,
): { channel: Channel; destination: string } | null {
  const configured = channels
    .map((channel) => ({ channel, destination: ownerDestination(channel) }))
    .filter(
      (candidate): candidate is { channel: Channel; destination: string } =>
        Boolean(candidate.destination),
    );
  if (!configured.length) {
    return null;
  }

  const preference = businessProfile.notificationPreference;
  if (preference === "telegram" || preference === "whatsapp") {
    return (
      configured.find((candidate) => candidate.channel.kind === preference) ??
      configured[0]
    );
  }

  return configured[0];
}

function ownerDestination(channel: Channel): string | null {
  const value =
    channel.kind === "telegram"
      ? channel.settings.ownerChatId
      : channel.kind === "whatsapp"
        ? channel.settings.ownerPhone
        : null;
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

async function recordOwnerNotificationResult(
  escalationId: string,
  clientId: string,
  result: OwnerNotificationResult,
): Promise<OwnerNotificationResult> {
  await query(
    `
      update escalations
      set owner_notification_status = $2,
          owner_notification_error = $3,
          owner_notified_at = case when $2 = 'sent' then now() else owner_notified_at end
      where id = $1 and client_id = $4
    `,
    [escalationId, result.status, result.status === "sent" ? null : result.detail, clientId],
  );
  return result;
}

function errorToMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
