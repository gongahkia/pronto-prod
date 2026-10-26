import { normalizeProviderName, type LlmProviderName } from "@/lib/llm";

export type LlmTask = "agent_answer" | "routing";

export type ModelChoice = {
  provider: LlmProviderName;
  model: string;
  costLabel: "low" | "standard" | "premium";
};

const modelCatalog: Record<Exclude<LlmProviderName, "mock">, Record<LlmTask, ModelChoice>> = {
  gemini: {
    agent_answer: { provider: "gemini", model: "gemini-3.8-flash", costLabel: "low" },
    routing: { provider: "gemini", model: "gemini-3.5-flash-lite", costLabel: "low" },
  },
  groq: {
    agent_answer: { provider: "groq", model: "openai/gpt-oss-20b", costLabel: "low" },
    routing: { provider: "groq", model: "openai/gpt-oss-20b", costLabel: "low" },
  },
  openai: {
    agent_answer: { provider: "openai", model: "gpt-5.5", costLabel: "standard" },
    routing: { provider: "openai", model: "gpt-5.4-mini", costLabel: "low" },
  },
  azure: {
    agent_answer: { provider: "azure", model: "gpt-5", costLabel: "standard" },
    routing: { provider: "azure", model: "gpt-5-mini", costLabel: "low" },
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
  ignoreEnvironment?: boolean;
}): ModelChoice {
  const provider = normalizeProviderName(input.provider);
  if (provider === "mock") {
    return { provider: "mock", model: "mock", costLabel: "low" };
  }

  const envModel = input.ignoreEnvironment ? undefined : envResponseModel(provider);
  const catalogChoice = modelCatalog[provider];
  const choice = catalogChoice[input.task];

  return {
    ...choice,
    model: envModel ?? input.configuredModel ?? choice.model,
  };
}

function envResponseModel(provider: Exclude<LlmProviderName, "mock">): string | undefined {
  if (provider === "gemini" || provider === "groq") return undefined;
  if (provider === "anthropic") {
    return process.env.ANTHROPIC_RESPONSE_MODEL?.trim() || undefined;
  }
  if (provider === "azure") {
    return (
      process.env.AZURE_OPENAI_RESPONSE_DEPLOYMENT?.trim() ||
      process.env.AZURE_OPENAI_DEPLOYMENT?.trim() ||
      undefined
    );
  }
  return process.env.OPENAI_RESPONSE_MODEL?.trim() || undefined;
}
