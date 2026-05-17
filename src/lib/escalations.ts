import { appBaseUrl } from "@/lib/env";
import { query } from "@/lib/db";
import { sendTelegramText } from "@/lib/channels/telegram";
import { sendWhatsAppText } from "@/lib/channels/whatsapp";
import type { Channel } from "@/lib/types";

type EscalationNotification = {
  id: string;
  reason_code: string;
  reason_detail: string;
  customer_message: string;
  client_id: string;
  conversation_id: string;
  customer_handle: string | null;
};

export async function notifyOwnerOfEscalation(escalationId: string): Promise<void> {
  const escalationResult = await query<EscalationNotification>(
    `
      select
        e.id,
        e.reason_code,
        e.reason_detail,
        e.client_id,
        e.conversation_id,
        m.body as customer_message,
        c.customer_handle
      from escalations e
      join messages m on m.id = e.message_id
      join conversations c on c.id = e.conversation_id
      where e.id = $1
    `,
    [escalationId],
  );
  const escalation = escalationResult.rows[0];
  if (!escalation) {
    return;
  }

  const channelResult = await query<Channel>(
    `
      select * from channels
      where client_id = $1
        and status = 'active'
        and kind in ('telegram', 'whatsapp')
      order by case kind when 'telegram' then 0 else 1 end
      limit 1
    `,
    [escalation.client_id],
  );
  const channel = channelResult.rows[0];
  if (!channel) {
    return;
  }

  const takeoverUrl = `${appBaseUrl()}/operator/clients/${escalation.client_id}#conversation-${escalation.conversation_id}`;
  const text = [
    "Pronto escalation",
    `Customer: ${escalation.customer_handle ?? "unknown"}`,
    `Question: ${escalation.customer_message}`,
    `Reason: ${escalation.reason_code} - ${escalation.reason_detail}`,
    `Take over: ${takeoverUrl}`,
  ].join("\n");

  if (channel.kind === "telegram") {
    const ownerChatId = channel.settings.ownerChatId as string | undefined;
    if (ownerChatId) {
      await sendTelegramText({ channel, externalThreadId: ownerChatId, text });
    }
  }

  if (channel.kind === "whatsapp") {
    const ownerPhone = channel.settings.ownerPhone as string | undefined;
    if (ownerPhone) {
      await sendWhatsAppText({ channel, externalThreadId: ownerPhone, text });
    }
  }

  await query("update escalations set owner_notified_at = now() where id = $1", [
    escalationId,
  ]);
}

