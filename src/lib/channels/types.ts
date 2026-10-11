import type { ChannelKind } from "@/lib/types";

export type NormalizedInboundMessage = {
  channelId: string;
  channelKind: ChannelKind;
  externalMessageId: string;
  externalThreadId: string;
  customerHandle: string;
  customerName?: string;
  occurredAt?: string;
  text: string;
  unsupportedMediaType?: string;
  raw: unknown;
};

export type ChannelSendInput = {
  channelId: string;
  externalThreadId: string;
  text: string;
};

export type ChannelAdapter = {
  sendText(input: ChannelSendInput): Promise<void>;
};
