import type { ChannelKind } from "@/lib/types";

export type ChannelDefinition = {
  kind: ChannelKind;
  label: string;
  iconPath: string;
  webhookLabel: string | null;
  webhookHint: string | null;
};

export const channelDefinitions = [
  {
    kind: "whatsapp",
    label: "WhatsApp",
    iconPath: "/channel-icons/whatsapp.png",
    webhookLabel: "Meta webhook URL",
    webhookHint:
      "Use settings.verifyToken and credentials.appSecret for X-Hub-Signature-256 checks.",
  },
  {
    kind: "telegram",
    label: "Telegram",
    iconPath: "/channel-icons/telegram.png",
    webhookLabel: "Telegram webhook URL",
    webhookHint:
      "Register this URL with setWebhook and pass settings.webhookSecret as X-Telegram-Bot-Api-Secret-Token.",
  },
  {
    kind: "messenger",
    label: "Messenger",
    iconPath: "/channel-icons/messenger.png",
    webhookLabel: "Messenger webhook URL",
    webhookHint:
      "Use settings.verifyToken and credentials.appSecret for X-Hub-Signature-256 checks.",
  },
  {
    kind: "instagram",
    label: "Instagram",
    iconPath: "/channel-icons/instagram.png",
    webhookLabel: "Instagram webhook URL",
    webhookHint:
      "Use settings.verifyToken and credentials.appSecret for X-Hub-Signature-256 checks.",
  },
  {
    kind: "email",
    label: "Email",
    iconPath: "/channel-icons/email.png",
    webhookLabel: "Inbound email webhook URL",
    webhookHint:
      "Configure the inbound webhook secret in settings.webhookSecret and delivery events in settings.eventWebhookSecret.",
  },
] satisfies ChannelDefinition[];

export const channelKinds = channelDefinitions.map((channel) => channel.kind);

export function channelDefinition(kind: ChannelKind): ChannelDefinition {
  return channelDefinitions.find((channel) => channel.kind === kind) ?? channelDefinitions[0];
}
