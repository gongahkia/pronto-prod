import { normalizeProviderName, type LlmProviderName } from "@/lib/llm";
import { azureOpenAiResponseModel } from "@/lib/llm/azure";
import { freeProviderById, isFreeLlmProviderId } from "@/lib/llm/free-providers";

export type LlmTask = "agent_answer" | "routing" | "fallback";

export type ModelChoice = {
  provider: LlmProviderName;
  model: string;
  costLabel: "low" | "standard" | "premium";
};

const modelCatalog: Record<"openai" | "azure" | "anthropic", Record<LlmTask, ModelChoice>> = {
  openai: {
    agent_answer: { provider: "openai", model: "gpt-5.5", costLabel: "standard" },
    routing: { provider: "openai", model: "gpt-5.4-mini", costLabel: "low" },
    fallback: { provider: "openai", model: "gpt-5.5", costLabel: "premium" },
  },
  azure: {
    agent_answer: { provider: "azure", model: "gpt-5.5", costLabel: "standard" },
    routing: { provider: "azure", model: "gpt-5.4-mini", costLabel: "low" },
    fallback: { provider: "azure", model: "gpt-5.5", costLabel: "premium" },
  },
  anthropic: {
    agent_answer: { provider: "anthropic", model: "claude-sonnet-4-5", costLabel: "standard" },
    routing: { provider: "anthropic", model: "claude-haiku-4-5", costLabel: "low" },
    fallback: { provider: "anthropic", model: "claude-opus-4-1", costLabel: "premium" },
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
  if (isFreeLlmProviderId(provider)) {
    const freeProvider = freeProviderById(provider);
    return {
      provider,
      model: input.configuredModel ?? freeProvider?.defaultModel ?? "mock",
      costLabel: "low",
    };
  }

  const envModel = (
    provider === "anthropic"
      ? process.env.ANTHROPIC_RESPONSE_MODEL
      : provider === "azure"
        ? azureOpenAiResponseModel()
        : process.env.OPENAI_RESPONSE_MODEL
  )?.trim() || undefined;
  const catalogChoice = modelCatalog[provider][input.task];

  return {
    ...catalogChoice,
    model: envModel ?? input.configuredModel ?? catalogChoice.model,
  };
}

export function failoverModelChoices(originProvider: string | null | undefined): ModelChoice[] {
  const origin = normalizeProviderName(originProvider);
  const chain: Array<"openai" | "azure" | "anthropic"> =
    origin === "openai"
      ? ["azure", "anthropic"]
      : origin === "azure"
        ? ["openai", "anthropic"]
        : origin === "anthropic"
          ? ["openai", "azure"]
          : ["openai", "azure", "anthropic"];
  return chain.map((provider) => {
    const choice = modelCatalog[provider].fallback;
    const envModel = (
      provider === "anthropic"
        ? process.env.ANTHROPIC_RESPONSE_MODEL
        : provider === "azure"
          ? azureOpenAiResponseModel()
          : process.env.OPENAI_RESPONSE_MODEL
    )?.trim();
    return {
      ...choice,
      model: envModel || choice.model,
    };
  });
}

export function failoverModelChoice(originProvider?: string | null): ModelChoice {
  return failoverModelChoices(originProvider)[0];
}
