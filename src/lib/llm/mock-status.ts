import { shouldUseMockAi } from "@/lib/env";
import { envApiKeyForProvider } from "@/lib/llm/credentials";
import { normalizeProviderName } from "@/lib/llm";

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

  if (responseProvider === "mock") {
    details.push("Customer-agent response provider is set to mock.");
  }
  if (responseProvider === "openai" && !envApiKeyForProvider("openai")) {
    details.push("OPENAI_API_KEY is not set; customer-agent OpenAI calls will fail outside explicit mock mode.");
  }
  if (responseProvider === "anthropic" && !envApiKeyForProvider("anthropic")) {
    details.push("ANTHROPIC_API_KEY is not set; customer-agent Anthropic calls will fail outside explicit mock mode.");
  }
  if (!envApiKeyForProvider("openai")) {
    details.push("OPENAI_API_KEY is not set; clients configured for OpenAI embeddings will fail outside explicit mock mode.");
  }

  return {
    active: details.length > 0,
    reason: details[0] ?? null,
    details,
  };
}
