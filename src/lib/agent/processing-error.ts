import { LlmConfigurationError, ProviderRequestError } from "@/lib/llm/errors";
import { TurnBudgetExceededError } from "@/lib/agent/turn-budget";
import { PromptBudgetExceededError } from "@/lib/llm/prompt-budget";

export class ProviderCooldownError extends Error {
  constructor(public readonly provider: string, public readonly retryAfterSeconds: number) {
    super("Provider recovery cooldown is active."); this.name = "ProviderCooldownError";
  }
}
export function processingFailure(error: unknown): {
  code: string; provider: string | null; retryable: boolean; delaySeconds?: number; deferred?: boolean;
} {
  if (error instanceof ProviderCooldownError) return { code: "provider_cooldown", provider: error.provider,
    retryable: true, delaySeconds: error.retryAfterSeconds, deferred: true };
  if (error instanceof ProviderRequestError) return { code: error.code, provider: error.provider,
    retryable: error.retryable, delaySeconds: error.retryAfterSeconds };
  if (error instanceof LlmConfigurationError) return { code: "configuration", provider: error.provider, retryable: false };
  if (error instanceof TurnBudgetExceededError) return { code: `turn_budget_${error.reason}`, provider: null, retryable: false };
  if (error instanceof PromptBudgetExceededError) return { code: "prompt_budget", provider: null, retryable: false };
  return { code: "processing_error", provider: null, retryable: true };
}
