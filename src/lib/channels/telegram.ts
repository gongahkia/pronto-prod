import { query } from "@/lib/db";
import type { NormalizedInboundMessage } from "@/lib/channels/types";
import type { Channel } from "@/lib/types";

export function verifyTelegramSecret(
  providedSecret: string | null,
  expectedSecret: string | undefined,
): boolean {
  if (!expectedSecret) {
    return process.env.NODE_ENV !== "production";
  }
  return providedSecret === expectedSecret;
}

export function normalizeTelegramPayload(
  channelId: string,
  payload: Record<string, unknown>,
): NormalizedInboundMessage[] {
  const candidate = payload.message ?? payload.business_message;
  if (!isRecord(candidate) || typeof candidate.text !== "string") {
    return [];
  }

  const chat = isRecord(candidate.chat) ? candidate.chat : {};
  if (typeof chat.id !== "string" && typeof chat.id !== "number") {
    return [];
  }

  const from = isRecord(candidate.from) ? candidate.from : {};
  const username = typeof from.username === "string" ? from.username : "";
  const firstName = typeof from.first_name === "string" ? from.first_name : "";
  const lastName = typeof from.last_name === "string" ? from.last_name : "";

  return [
    {
      channelId,
      channelKind: "telegram",
      externalMessageId: String(candidate.message_id),
      externalThreadId: String(chat.id),
      customerHandle: username ? `@${username}` : String(chat.id),
      customerName: [firstName, lastName].filter(Boolean).join(" ") || undefined,
      text: candidate.text,
      raw: payload,
    },
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function sendTelegramText(input: {
  channel: Channel;
  externalThreadId: string;
  text: string;
}): Promise<void> {
  const token =
    (input.channel.credentials.botToken as string | undefined) ??
    process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    console.warn("Telegram bot token missing; skipping outbound send.");
    return;
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: input.externalThreadId,
      text: input.text,
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram send failed: ${response.status} ${body}`);
  }
}

export async function getTelegramChannel(channelId: string): Promise<Channel | null> {
  const result = await query<Channel>(
    "select * from channels where id = $1 and kind = 'telegram'",
    [channelId],
  );
  return result.rows[0] ?? null;
}
