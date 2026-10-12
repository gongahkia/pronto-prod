import type { Channel } from "@/lib/types";
import { ChannelPolicyError } from "@/lib/channels/provider-error";
import { isSupportedMetaGraphVersion, metaGraphVersion, whatsAppGraphVersion } from "@/lib/env";

export const PROACTIVE_WHATSAPP_PURPOSE = "proactive_notification";

export type ChannelSendPolicy = {
  purpose?: string;
  whatsappTemplateName?: string;
  whatsappTemplateApproved?: boolean;
  whatsappTemplateLanguage?: string;
};

export function assertChannelSendAllowed(
  channel: Channel,
  policy?: ChannelSendPolicy,
): void {
  if (channel.kind === "whatsapp" && !isSupportedMetaGraphVersion(whatsAppGraphVersion())) {
    throw new ChannelPolicyError("WhatsApp Graph API version is expired or invalid.");
  }
  if ((channel.kind === "instagram" || channel.kind === "messenger") && !isSupportedMetaGraphVersion(metaGraphVersion())) {
    throw new ChannelPolicyError("Meta Graph API version is expired or invalid.");
  }
  if (channel.kind !== "whatsapp") {
    return;
  }
  if (policy?.purpose !== PROACTIVE_WHATSAPP_PURPOSE && !policy?.whatsappTemplateName) {
    return;
  }
  if (policy?.whatsappTemplateName && policy.whatsappTemplateApproved === true) return;
  throw new ChannelPolicyError(
    "WhatsApp proactive notifications require an approved message template before sending.",
  );
}

export function policyFromOutboundMetadata(
  metadata: Record<string, unknown>,
): ChannelSendPolicy | undefined {
  const purpose = stringValue(metadata.purpose);
  const whatsappTemplateName = stringValue(metadata.whatsappTemplateName);
  const whatsappTemplateApproved = booleanValue(metadata.whatsappTemplateApproved);
  const whatsappTemplateLanguage = stringValue(metadata.whatsappTemplateLanguage);

  if (
    purpose !== PROACTIVE_WHATSAPP_PURPOSE &&
    !whatsappTemplateName &&
    whatsappTemplateApproved === undefined
  ) {
    return undefined;
  }

  return {
    purpose,
    whatsappTemplateName,
    whatsappTemplateApproved,
    whatsappTemplateLanguage,
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
