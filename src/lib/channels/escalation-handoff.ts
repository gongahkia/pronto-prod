import type { Channel } from "@/lib/types";

export const ESCALATION_HOLDING_REPLY_SETTING = "escalationHoldingReply";

export const DEFAULT_ESCALATION_HOLDING_REPLY =
  "Thanks, I'll get the team to take a look and follow up with you.";

export function getEscalationHoldingReply(
  settings: Channel["settings"],
): string {
  const configured = settings[ESCALATION_HOLDING_REPLY_SETTING];
  if (typeof configured !== "string") {
    return DEFAULT_ESCALATION_HOLDING_REPLY;
  }

  const trimmed = configured.trim();
  return trimmed.length ? trimmed : DEFAULT_ESCALATION_HOLDING_REPLY;
}

export function settingsWithoutEscalationHoldingReply(
  settings: Channel["settings"],
): Channel["settings"] {
  const next = { ...settings };
  delete next[ESCALATION_HOLDING_REPLY_SETTING];
  return next;
}

export function mergeEscalationHoldingReply(
  settings: Channel["settings"],
  holdingReply: string,
): Channel["settings"] {
  const next = settingsWithoutEscalationHoldingReply(settings);
  const trimmed = holdingReply.trim();
  if (trimmed) {
    next[ESCALATION_HOLDING_REPLY_SETTING] = trimmed;
  }
  return next;
}
