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

  if (channel.kind === "messenger" || channel.kind === "instagram") {
    return checkMetaPlatformHealth(channel);
  }

  if (channel.kind === "email") {
    return checkEmailHealth(channel);
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

  if (channel.kind === "messenger") {
    const token =
      (channel.credentials.pageAccessToken as string | undefined) ??
      process.env.MESSENGER_PAGE_ACCESS_TOKEN;
    const appSecret =
      (channel.credentials.appSecret as string | undefined) ??
      process.env.MESSENGER_APP_SECRET;
    const verifyToken =
      (channel.settings.verifyToken as string | undefined) ??
      process.env.MESSENGER_VERIFY_TOKEN;
    if (!token) return "Messenger page access token is missing.";
    if (!appSecret) return "Messenger app secret is missing.";
    if (!verifyToken) return "Messenger webhook verify token is missing.";
    return null;
  }

  if (channel.kind === "instagram") {
    const token =
      (channel.credentials.pageAccessToken as string | undefined) ??
      process.env.INSTAGRAM_PAGE_ACCESS_TOKEN;
    const appSecret =
      (channel.credentials.appSecret as string | undefined) ??
      process.env.INSTAGRAM_APP_SECRET;
    const verifyToken =
      (channel.settings.verifyToken as string | undefined) ??
      process.env.INSTAGRAM_VERIFY_TOKEN;
    const igUserId =
      (channel.credentials.igUserId as string | undefined) ?? channel.external_id;
    if (!token) return "Instagram page access token is missing.";
    if (!appSecret) return "Instagram app secret is missing.";
    if (!verifyToken) return "Instagram webhook verify token is missing.";
    if (!igUserId) return "Instagram user ID is missing.";
    return null;
  }

  if (channel.kind === "email") {
    const provider =
      (channel.credentials.provider as string | undefined) ?? "postmark";
    const apiKey =
      (channel.credentials.apiKey as string | undefined) ??
      (provider === "postmark"
        ? process.env.POSTMARK_API_TOKEN
        : process.env.RESEND_API_KEY);
    const fromAddress =
      (channel.credentials.fromAddress as string | undefined) ??
      (provider === "postmark"
        ? process.env.POSTMARK_FROM_ADDRESS
        : process.env.RESEND_FROM_ADDRESS);
    if (!apiKey) return `Email ${provider} API key is missing.`;
    if (!fromAddress) return `Email ${provider} from-address is missing.`;
    return null;
  }

  return null;
}

export async function recordOutboundHealth(
  channelId: string,
  clientId: string,
  error?: unknown,
): Promise<void> {
  await query(
    `
      update channels
      set last_outbound_at = now(),
          last_outbound_error = $2,
          updated_at = now()
      where id = $1 and client_id = $3
    `,
    [channelId, error ? errorToMessage(error) : null, clientId],
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

async function checkMetaPlatformHealth(channel: Channel): Promise<ChannelHealthResult> {
  const token =
    (channel.credentials.pageAccessToken as string | undefined) ??
    (channel.kind === "messenger"
      ? process.env.MESSENGER_PAGE_ACCESS_TOKEN
      : process.env.INSTAGRAM_PAGE_ACCESS_TOKEN);
  const graphVersion = process.env.META_GRAPH_VERSION ?? "v20.0";
  const response = await fetch(
    `https://graph.facebook.com/${graphVersion}/me?fields=id,name`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) {
    return {
      status: "degraded",
      detail: `${channel.kind} Graph /me failed with HTTP ${response.status}.`,
      checkedLive: true,
    };
  }
  return {
    status: "healthy",
    detail: `${channel.kind} page token is valid.`,
    checkedLive: true,
  };
}

async function checkEmailHealth(channel: Channel): Promise<ChannelHealthResult> {
  const provider =
    (channel.credentials.provider as string | undefined) ?? "postmark";
  const apiKey =
    (channel.credentials.apiKey as string | undefined) ??
    (provider === "postmark"
      ? process.env.POSTMARK_API_TOKEN
      : process.env.RESEND_API_KEY);

  const url =
    provider === "postmark"
      ? "https://api.postmarkapp.com/server"
      : "https://api.resend.com/domains";
  const headers: Record<string, string> =
    provider === "postmark"
      ? { Accept: "application/json", "X-Postmark-Server-Token": apiKey ?? "" }
      : { Authorization: `Bearer ${apiKey ?? ""}` };

  const response = await fetch(url, { headers });
  if (!response.ok) {
    return {
      status: "degraded",
      detail: `Email ${provider} health check failed with HTTP ${response.status}.`,
      checkedLive: true,
    };
  }
  return {
    status: "healthy",
    detail: `Email ${provider} credentials are valid.`,
    checkedLive: true,
  };
}

function errorToMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
