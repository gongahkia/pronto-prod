import { shouldUseMockAi } from "@/lib/env";
import { azureOpenAiBaseUrl } from "@/lib/llm/azure";
import { envApiKeyForProvider } from "@/lib/llm/credentials";
import { normalizeProviderName } from "@/lib/llm";
import { freeProviderById, isFreeLlmProviderId } from "@/lib/llm/free-providers";

export type MockAiStatus = {
  active: boolean;
  reason: string | null;
  details: string[];
};

export function getMockAiStatus(): MockAiStatus {
  if (shouldUseMockAi()) {
    return {
      active: true,
      reason: "PRONTO_USE_MOCK_AI=1",
      details: ["Generation and embeddings are using deterministic mock output."],
    };
  }

  const details: string[] = [];
  const responseProvider = normalizeProviderName(
    process.env.PRONTO_LLM_PROVIDER ?? "openai",
  );
  const assistantProvider = normalizeProviderName(
    process.env.PRONTO_ASSISTANT_LLM_PROVIDER ?? process.env.PRONTO_LLM_PROVIDER,
  );

  if (responseProvider === "mock") {
    details.push("Customer-agent response provider is set to mock.");
  }
  if (assistantProvider === "mock") {
    details.push("Assistant dock provider is set to mock.");
  }
  if (responseProvider === "openai" && !envApiKeyForProvider("openai")) {
    details.push("OPENAI_API_KEY is not set; customer-agent OpenAI calls will fail outside explicit mock mode unless a saved credential exists.");
  }
  if (responseProvider === "azure") {
    if (!envApiKeyForProvider("azure")) {
      details.push("AZURE_OPENAI_API_KEY is not set; customer-agent Azure OpenAI calls will fail outside explicit mock mode unless a saved credential exists.");
    }
    if (!azureOpenAiBaseUrl()) {
      details.push("AZURE_OPENAI_BASE_URL or AZURE_OPENAI_ENDPOINT is not set, so customer-agent Azure OpenAI calls will fail outside explicit mock mode.");
    }
  }
  if (responseProvider === "anthropic" && !process.env.ANTHROPIC_API_KEY?.trim()) {
    details.push("ANTHROPIC_API_KEY is not set; customer-agent Anthropic calls will fail outside explicit mock mode unless a saved credential exists.");
  }
  if (assistantProvider === "openai" && !envApiKeyForProvider("openai")) {
    details.push("OPENAI_API_KEY is not set; the assistant dock will fail outside explicit mock mode unless a saved credential exists.");
  }
  if (assistantProvider === "azure") {
    if (!envApiKeyForProvider("azure")) {
      details.push("AZURE_OPENAI_API_KEY is not set; the assistant dock will fail outside explicit mock mode unless a saved credential exists.");
    }
    if (!azureOpenAiBaseUrl()) {
      details.push("AZURE_OPENAI_BASE_URL or AZURE_OPENAI_ENDPOINT is not set, so the assistant dock will fail outside explicit mock mode.");
    }
  }
  if (assistantProvider === "anthropic" && !process.env.ANTHROPIC_API_KEY?.trim()) {
    details.push("ANTHROPIC_API_KEY is not set; the assistant dock will fail outside explicit mock mode unless a saved credential exists.");
  }
  if (!envApiKeyForProvider("openai")) {
    details.push("OPENAI_API_KEY is not set; clients configured for OpenAI embeddings will fail outside explicit mock mode unless a saved credential exists.");
  }
  for (const provider of [responseProvider, assistantProvider]) {
    if (!isFreeLlmProviderId(provider)) {
      continue;
    }
    const freeProvider = freeProviderById(provider);
    if (freeProvider?.requiresApiKey && !envApiKeyForProvider(provider)) {
      details.push(
        `${freeProvider.name} API key is not set in env; calls require a saved credential or will fail.`,
      );
    }
  }

  return {
    active: details.length > 0,
    reason: details[0] ?? null,
    details,
  };
}
