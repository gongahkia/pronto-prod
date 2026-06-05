import type { Channel } from "@/lib/types";

export const PROACTIVE_WHATSAPP_PURPOSE = "proactive_notification";

export type ChannelSendPolicy = {
  purpose?: string;
  whatsappTemplateName?: string;
  whatsappTemplateApproved?: boolean;
};

export function assertChannelSendAllowed(
  channel: Channel,
  policy?: ChannelSendPolicy,
): void {
  if (channel.kind !== "whatsapp" || !isProactiveWhatsAppPolicy(policy)) {
    return;
  }

  if (policy.whatsappTemplateName && policy.whatsappTemplateApproved === true) {
    return;
  }

  throw new Error(
    "WhatsApp proactive notifications require an approved message template before sending.",
  );
}

export function policyFromOutboundMetadata(
  metadata: Record<string, unknown>,
): ChannelSendPolicy | undefined {
  const purpose = stringValue(metadata.purpose);
  const whatsappTemplateName = stringValue(metadata.whatsappTemplateName);
  const whatsappTemplateApproved = booleanValue(metadata.whatsappTemplateApproved);

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
  };
}

function isProactiveWhatsAppPolicy(
  policy: ChannelSendPolicy | undefined,
): policy is ChannelSendPolicy {
  return policy?.purpose === PROACTIVE_WHATSAPP_PURPOSE;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
