import { appBaseUrl } from "@/lib/env";
import { query } from "@/lib/db";
import { sendChannelText } from "@/lib/channels/dispatch";
import { sendEmail } from "@/lib/channels/email";
import { decryptChannelCredentials } from "@/lib/channels/credentials";
import type { Channel, DeliveryStatus } from "@/lib/types";
import { AmbiguousProviderAcceptanceError, ProviderSendError } from "@/lib/channels/provider-error";

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
  ambiguous?: boolean;
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
        and kind in ('telegram', 'whatsapp', 'email')
      order by case kind when 'email' then 0 when 'telegram' then 1 else 2 end
    `,
    [escalation.client_id],
  );
  const channels = channelResult.rows.map((channel) => decryptChannelCredentials(channel));
  const policy = await query<{ initial_destination_id: string | null }>(
    `select policy->>'initialDestinationId' as initial_destination_id
     from escalation_policy_versions where client_id = $1 order by version desc limit 1`,
    [escalation.client_id]);
  const destinationResult = await query<{ id: string; kind: string; destination: string; audience: string }>(
    `select id, kind, destination, audience from staff_notification_destinations
     where client_id = $1 and enabled = true and verified_at is not null
     order by case when id::text = $2 then 0 else 1 end, updated_at desc`,
    [escalation.client_id, policy.rows[0]?.initial_destination_id ?? ""]);
  const verified = destinationResult.rows.map((row) => ({
    channel: channels.find((channel) => channel.kind === row.kind),
    destination: row.destination, audience: row.audience,
  })).find((row) => row.channel);
  const channelSelection = verified?.channel
    ? { channel: verified.channel, destination: verified.destination, audience: verified.audience }
    : selectOwnerNotificationChannel(channels, escalation.business_profile);
  if (!channelSelection) {
    return recordOwnerNotificationResult(escalation.id, escalation.client_id, {
      status: "skipped",
      detail: channelResult.rows.length
        ? "No owner notification destination configured."
        : "No active owner notification channel configured.",
    });
  }
  const { channel, destination } = channelSelection;

  const takeoverPath = "audience" in channelSelection && channelSelection.audience === "operator"
    ? `/operator/clients/${escalation.client_id}/conversations/${escalation.conversation_id}`
    : `/client/conversations/${escalation.conversation_id}`;
  const takeoverUrl = `${appBaseUrl()}${takeoverPath}`;
  const text = [
    "Pronto escalation",
    "A customer conversation needs an authorized human response.",
    `Take over: ${takeoverUrl}`,
  ].join("\n");

  try {
    if (channel.kind === "email" && channel.credentials.provider === "local_smtp") {
      await sendEmail({ channel, to: destination, subject: "Pronto escalation", text });
    } else await sendChannelText({
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
      ambiguous: error instanceof AmbiguousProviderAcceptanceError ||
        (error instanceof ProviderSendError && error.ambiguous),
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
): { channel: Channel; destination: string; audience: "business" | "operator" } | null {
  const configured = channels
    .map((channel) => ({ channel, destination: ownerDestination(channel),
      audience: channel.settings.ownerNotificationAudience === "operator" ? "operator" as const : "business" as const }))
    .filter(
      (candidate): candidate is { channel: Channel; destination: string; audience: "business" | "operator" } =>
        Boolean(candidate.destination),
    );
  if (!configured.length) {
    return null;
  }

  const preference = businessProfile.notificationPreference;
  if (preference === "telegram" || preference === "whatsapp" || preference === "email") {
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
        : channel.kind === "email" && channel.credentials.provider === "local_smtp" &&
          process.env.PRONTO_LOCAL_EMAIL_ENABLED === "1"
          ? channel.settings.ownerEmail : null;
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
