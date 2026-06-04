import {
  processInboundMessage,
  type ProcessedInboundMessage,
} from "@/lib/channels/process";
import type { NormalizedInboundMessage } from "@/lib/channels/types";

export type WebhookBatchResult = {
  ok: boolean;
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
      results.push({
        ok: false,
        externalMessageId: message.externalMessageId,
        error: errorToMessage(error),
      });
    }
  }

  const failed = results.filter((result) => !result.ok).length;
  return {
    ok: failed === 0,
    processed: results.length - failed,
    failed,
    results,
  };
}

function errorToMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
