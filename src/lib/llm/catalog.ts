import { normalizeProviderName, type LlmProviderName } from "@/lib/llm";

export type LlmTask = "agent_answer" | "routing";

export type ModelChoice = {
  provider: LlmProviderName;
  model: string;
  costLabel: "low" | "standard" | "premium";
};

const modelCatalog: Record<"openai" | "anthropic", Record<LlmTask, ModelChoice>> = {
  openai: {
    agent_answer: { provider: "openai", model: "gpt-5.5", costLabel: "standard" },
    routing: { provider: "openai", model: "gpt-5.4-mini", costLabel: "low" },
  },
  anthropic: {
    agent_answer: { provider: "anthropic", model: "claude-sonnet-4-5", costLabel: "standard" },
    routing: { provider: "anthropic", model: "claude-haiku-4-5", costLabel: "low" },
  },
};

export function selectModel(input: {
  provider: string | null | undefined;
  configuredModel?: string | null;
  task: LlmTask;
}): ModelChoice {
  const provider = normalizeProviderName(input.provider);
  if (provider === "mock") {
    return { provider: "mock", model: "mock", costLabel: "low" };
  }

  const envModel = (
    provider === "anthropic"
      ? process.env.ANTHROPIC_RESPONSE_MODEL
      : process.env.OPENAI_RESPONSE_MODEL
  )?.trim() || undefined;
  const catalogChoice = modelCatalog[provider];
  const choice = catalogChoice[input.task];

  return {
    ...choice,
    model: envModel ?? input.configuredModel ?? choice.model,
  };
}
