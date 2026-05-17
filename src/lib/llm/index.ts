import { AnthropicProvider } from "@/lib/llm/anthropic";
import { mockEmbed, mockGroundedAnswer } from "@/lib/llm/mock";
import { OpenAiProvider } from "@/lib/llm/openai";
import type {
  GenerateAnswerInput,
  GroundedAnswerDecision,
  LlmProvider,
} from "@/lib/llm/types";

export type LlmProviderName = "mock" | "openai" | "anthropic";

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
  return openAiProvider;
}

export function getEmbeddingProvider(provider: string | null | undefined): LlmProvider {
  const normalized = normalizeProviderName(provider);
  if (process.env.PRONTO_USE_MOCK_AI === "1" || normalized === "mock") {
    return mockProvider;
  }
  return openAiProvider;
}
