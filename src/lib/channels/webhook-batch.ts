import {
  processInboundMessage,
  type ProcessedInboundMessage,
} from "@/lib/channels/process";
import { logWarn } from "@/lib/logger";
import type { NormalizedInboundMessage } from "@/lib/channels/types";

export type WebhookBatchResult = {
  ok: boolean;
  requestId?: string;
  processed: number;
  failed: number;
  results: WebhookBatchMessageResult[];
};

type WebhookBatchMessageResult =
  | {
      ok: true;
      externalMessageId: string;
      result: ProcessedInboundMessage;
    }
  | {
      ok: false;
      externalMessageId: string;
      error: string;
    };

export async function processWebhookBatch(
  messages: NormalizedInboundMessage[],
  context: { requestId?: string } = {},
): Promise<WebhookBatchResult> {
  const results: WebhookBatchMessageResult[] = [];

  for (const message of messages) {
    try {
      results.push({
        ok: true,
        externalMessageId: message.externalMessageId,
        result: await processInboundMessage(message),
      });
    } catch (error) {
      logWarn("webhook_message_processing_failed", {
        requestId: context.requestId,
        channelId: message.channelId,
        channelKind: message.channelKind,
        externalMessageId: message.externalMessageId,
        error,
      });
      results.push({
        ok: false,
        externalMessageId: message.externalMessageId,
        error: "Message processing failed.",
      });
    }
  }

  const failed = results.filter((result) => !result.ok).length;
  return {
    ok: failed === 0,
    ...(context.requestId ? { requestId: context.requestId } : {}),
    processed: results.length - failed,
    failed,
    results,
  };
}
