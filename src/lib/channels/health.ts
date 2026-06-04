import { query } from "@/lib/db";
import { whatsAppGraphVersion } from "@/lib/env";
import type { Channel } from "@/lib/types";

export type ChannelHealthStatus = "healthy" | "degraded" | "unconfigured";

export type ChannelHealthResult = {
  status: ChannelHealthStatus;
  detail: string;
  checkedLive: boolean;
};

export async function checkChannelHealth(channelId: string): Promise<ChannelHealthResult> {
  const result = await query<Channel>("select * from channels where id = $1", [
    channelId,
  ]);
  const channel = result.rows[0];
  if (!channel) {
    throw new Error(`Channel not found: ${channelId}`);
  }

  const health = await runChannelHealthCheck(channel);
  await query(
    `
      update channels
      set last_health_check_at = now(),
          last_health_status = $2,
          last_health_error = $3,
          updated_at = now()
      where id = $1
    `,
    [channel.id, health.status, health.status === "healthy" ? null : health.detail],
  );

  return health;
}

export async function runChannelHealthCheck(
  channel: Channel,
): Promise<ChannelHealthResult> {
  if (channel.kind === "console") {
    return { status: "healthy", detail: "Console channel is local-only.", checkedLive: false };
  }

  const configIssue = validateChannelHealthConfig(channel);
  if (configIssue) {
    return { status: "unconfigured", detail: configIssue, checkedLive: false };
  }

  if (process.env.PRONTO_SKIP_LIVE_HEALTH === "1") {
    return {
      status: "degraded",
      detail: "Live health check skipped by PRONTO_SKIP_LIVE_HEALTH=1.",
      checkedLive: false,
    };
  }

  if (channel.kind === "telegram") {
    return checkTelegramHealth(channel);
  }

  if (channel.kind === "whatsapp") {
    return checkWhatsAppHealth(channel);
  }

  return { status: "unconfigured", detail: "Unsupported channel kind.", checkedLive: false };
}

export function validateChannelHealthConfig(channel: Channel): string | null {
  if (channel.kind === "telegram") {
    const token =
      (channel.credentials.botToken as string | undefined) ??
      process.env.TELEGRAM_BOT_TOKEN;
    const secret =
      (channel.settings.webhookSecret as string | undefined) ??
      process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!token) {
      return "Telegram bot token is missing.";
    }
    if (!secret) {
      return "Telegram webhook secret is missing.";
    }
    return null;
  }

  if (channel.kind === "whatsapp") {
    const token =
      (channel.credentials.accessToken as string | undefined) ??
      process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId =
      (channel.credentials.phoneNumberId as string | undefined) ?? channel.external_id;
    const verifyToken =
      (channel.settings.verifyToken as string | undefined) ??
      process.env.WHATSAPP_VERIFY_TOKEN;
    const appSecret =
      (channel.credentials.appSecret as string | undefined) ??
      process.env.WHATSAPP_APP_SECRET;
    if (!token) {
      return "WhatsApp access token is missing.";
    }
    if (!phoneNumberId) {
      return "WhatsApp phone number ID is missing.";
    }
    if (!verifyToken) {
      return "WhatsApp webhook verify token is missing.";
    }
    if (!appSecret) {
      return "WhatsApp app secret is missing.";
    }
    return null;
  }

  return null;
}

export async function recordOutboundHealth(
  channelId: string,
  error?: unknown,
): Promise<void> {
  await query(
    `
      update channels
      set last_outbound_at = now(),
          last_outbound_error = $2,
          updated_at = now()
      where id = $1
    `,
    [channelId, error ? errorToMessage(error) : null],
  );
}

async function checkTelegramHealth(channel: Channel): Promise<ChannelHealthResult> {
  const token =
    (channel.credentials.botToken as string | undefined) ??
    process.env.TELEGRAM_BOT_TOKEN;
  const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  if (!response.ok) {
    return {
      status: "degraded",
      detail: `Telegram getMe failed with HTTP ${response.status}.`,
      checkedLive: true,
    };
  }

  const body = (await response.json()) as { ok?: boolean; description?: string };
  if (!body.ok) {
    return {
      status: "degraded",
      detail: body.description ?? "Telegram getMe returned ok=false.",
      checkedLive: true,
    };
  }

  return { status: "healthy", detail: "Telegram bot credentials are valid.", checkedLive: true };
}

async function checkWhatsAppHealth(channel: Channel): Promise<ChannelHealthResult> {
  const token =
    (channel.credentials.accessToken as string | undefined) ??
    process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId =
    (channel.credentials.phoneNumberId as string | undefined) ?? channel.external_id;
  const response = await fetch(
    `https://graph.facebook.com/${whatsAppGraphVersion()}/${phoneNumberId}?fields=id,display_phone_number,verified_name`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) {
    return {
      status: "degraded",
      detail: `WhatsApp phone number check failed with HTTP ${response.status}.`,
      checkedLive: true,
    };
  }

  return {
    status: "healthy",
    detail: "WhatsApp phone number credentials are valid.",
    checkedLive: true,
  };
}

function errorToMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
