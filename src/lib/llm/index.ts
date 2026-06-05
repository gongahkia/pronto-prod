import { AnthropicProvider } from "@/lib/llm/anthropic";
import { isFreeLlmProviderId, type FreeLlmProviderId } from "@/lib/llm/free-providers";
import { mockEmbed, mockGroundedAnswer } from "@/lib/llm/mock";
import { OpenAiProvider } from "@/lib/llm/openai";
import { OpenAiCompatibleProvider } from "@/lib/llm/openai-compatible";
import type {
  GenerateAnswerInput,
  GroundedAnswerDecision,
  LlmProvider,
} from "@/lib/llm/types";

export type LlmProviderName = "mock" | "openai" | "anthropic" | FreeLlmProviderId;

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
const anthropicProvider = new AnthropicProvider();

export function normalizeProviderName(value: string | null | undefined): LlmProviderName {
  if (value === "anthropic" || value === "openai" || value === "mock") {
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
      embed: (texts, model) => openAiProvider.embed(texts, model),
    };
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
  return openAiProvider;
}
