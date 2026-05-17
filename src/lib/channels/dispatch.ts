import { query } from "@/lib/db";
import { sendTelegramText } from "@/lib/channels/telegram";
import { sendWhatsAppText } from "@/lib/channels/whatsapp";
import type { Channel } from "@/lib/types";

export async function sendChannelText(input: {
  channelId: string;
  externalThreadId: string;
  text: string;
}): Promise<void> {
  const channelResult = await query<Channel>("select * from channels where id = $1", [
    input.channelId,
  ]);
  const channel = channelResult.rows[0];
  if (!channel) {
    throw new Error(`Channel not found: ${input.channelId}`);
  }

  if (channel.kind === "whatsapp") {
    await sendWhatsAppText({ channel, externalThreadId: input.externalThreadId, text: input.text });
    return;
  }

  if (channel.kind === "telegram") {
    await sendTelegramText({ channel, externalThreadId: input.externalThreadId, text: input.text });
  }
}

