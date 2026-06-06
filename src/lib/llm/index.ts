import { AnthropicProvider } from "@/lib/llm/anthropic";
import { AzureOpenAiProvider } from "@/lib/llm/azure";
import { isFreeLlmProviderId, type FreeLlmProviderId } from "@/lib/llm/free-providers";
import { mockEmbed, mockGroundedAnswer } from "@/lib/llm/mock";
import { OpenAiProvider } from "@/lib/llm/openai";
import { OpenAiCompatibleProvider } from "@/lib/llm/openai-compatible";
import type {
  GenerateAnswerInput,
  GroundedAnswerDecision,
  LlmCallContext,
  LlmProvider,
} from "@/lib/llm/types";

export type LlmProviderName = "mock" | "openai" | "azure" | "anthropic" | FreeLlmProviderId;

class MockProvider implements LlmProvider {
  async generateGroundedAnswer(
    input: GenerateAnswerInput,
  ): Promise<GroundedAnswerDecision> {
    return mockGroundedAnswer(input);
  }

  async embed(texts: string[]): Promise<number[][]> {
    return mockEmbed(texts);
  }
}

const mockProvider = new MockProvider();
const openAiProvider = new OpenAiProvider();
const azureOpenAiProvider = new AzureOpenAiProvider();
const anthropicProvider = new AnthropicProvider();

export function normalizeProviderName(value: string | null | undefined): LlmProviderName {
  if (value === "anthropic" || value === "azure" || value === "openai" || value === "mock") {
    return value;
  }
  if (isFreeLlmProviderId(value)) {
    return value;
  }
  return "openai";
}

export function getGenerationProvider(provider: string | null | undefined): LlmProvider {
  const normalized = normalizeProviderName(provider);
  if (process.env.PRONTO_USE_MOCK_AI === "1" || normalized === "mock") {
    return mockProvider;
  }
  if (normalized === "anthropic") {
    return {
      generateGroundedAnswer: (input) => anthropicProvider.generateGroundedAnswer(input),
      embed: (texts, model, context?: LlmCallContext) =>
        openAiProvider.embed(texts, model, context),
    };
  }
  if (normalized === "azure") {
    return azureOpenAiProvider;
  }
  if (isFreeLlmProviderId(normalized)) {
    return new OpenAiCompatibleProvider(normalized);
  }
  return openAiProvider;
}

export function getEmbeddingProvider(provider: string | null | undefined): LlmProvider {
  const normalized = normalizeProviderName(provider);
  if (process.env.PRONTO_USE_MOCK_AI === "1" || normalized === "mock") {
    return mockProvider;
  }
  if (isFreeLlmProviderId(normalized)) {
    return mockProvider;
  }
  if (normalized === "azure") {
    return azureOpenAiProvider;
  }
  return openAiProvider;
}
