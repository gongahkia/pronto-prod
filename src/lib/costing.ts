import { query } from "@/lib/db";
import { estimateTokens } from "@/lib/knowledge/chunk";

export type CostLabel = "low" | "standard" | "premium";

export type UsageCostEstimate = {
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
};

const usdPerMillionByLabel: Record<
  CostLabel,
  { input: number; output: number }
> = {
  low: { input: 0.25, output: 1.25 },
  standard: { input: 1.25, output: 10 },
  premium: { input: 5, output: 25 },
};

const embeddingUsdPerMillionInput = 0.02;

export function estimateGenerationCost(input: {
  inputText: string;
  outputText: string;
  costLabel: CostLabel;
}): UsageCostEstimate {
  const inputTokens = estimateTokens(input.inputText);
  const outputTokens = estimateTokens(input.outputText);
  const rates = usdPerMillionByLabel[input.costLabel];
  return {
    inputTokens,
    outputTokens,
    estimatedCostUsd:
      (inputTokens / 1_000_000) * rates.input +
      (outputTokens / 1_000_000) * rates.output,
  };
}

export function estimateEmbeddingCost(text: string): UsageCostEstimate {
  const inputTokens = estimateTokens(text);
  return {
    inputTokens,
    outputTokens: 0,
    estimatedCostUsd: (inputTokens / 1_000_000) * embeddingUsdPerMillionInput,
  };
}

export async function recordAgentUsageEvent(input: {
  clientId: string;
  conversationId?: string | null;
  messageId?: string | null;
  channelId?: string | null;
  provider: string;
  model: string;
  operation: "embedding" | "generation";
  estimate: UsageCostEstimate;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await query(
    `
      insert into agent_usage_events (
        client_id,
        conversation_id,
        message_id,
        channel_id,
        provider,
        model,
        operation,
        input_tokens,
        output_tokens,
        estimated_cost_usd,
        metadata
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `,
    [
      input.clientId,
      input.conversationId ?? null,
      input.messageId ?? null,
      input.channelId ?? null,
      input.provider,
      input.model,
      input.operation,
      input.estimate.inputTokens,
      input.estimate.outputTokens,
      input.estimate.estimatedCostUsd,
      input.metadata ?? {},
    ],
  );
}

export function formatSgd(value: number): string {
  return `SGD ${Math.round(value).toLocaleString("en-SG")}`;
}
