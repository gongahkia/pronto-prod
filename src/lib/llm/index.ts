import { AnthropicProvider } from "@/lib/llm/anthropic";
import { AzureOpenAiProvider } from "@/lib/llm/azure";
import { LlmConfigurationError } from "@/lib/llm/errors";
import { shouldUseMockAi } from "@/lib/env";
import { aiExecutionMode } from "@/lib/llm/execution-mode";
import { mockEmbed, mockGroundedAnswer } from "@/lib/llm/mock";
import { OpenAiProvider } from "@/lib/llm/openai";
import { FreeTierProvider } from "@/lib/llm/free-providers";
import { prepareGenerationInput } from "@/lib/llm/prompt-budget";
import { runTurnModelCall } from "@/lib/agent/turn-budget";
import { estimateTokens } from "@/lib/knowledge/chunk";
import type {
  GenerateAnswerInput,
  GroundedAnswerDecision,
  LlmCallContext,
  LlmProvider,
} from "@/lib/llm/types";

export type LlmProviderName = "mock" | "openai" | "azure" | "anthropic" | "gemini" | "groq";

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
const geminiProvider = new FreeTierProvider("gemini");
const groqProvider = new FreeTierProvider("groq");

class UnsupportedEmbeddingProvider implements LlmProvider {
  constructor(private readonly provider: string) {}

  async generateGroundedAnswer(): Promise<GroundedAnswerDecision> {
    throw new LlmConfigurationError(
      this.provider,
      "This provider is not configured for grounded answer generation.",
    );
  }

  async embed(): Promise<number[][]> {
    throw new LlmConfigurationError(
      this.provider,
      "This provider does not support embeddings in Pronto. Configure openai or mock embeddings.",
    );
  }
}

export function normalizeProviderName(value: string | null | undefined): LlmProviderName {
  if (value === "anthropic" || value === "azure" || value === "openai" || value === "mock" || value === "gemini" || value === "groq") {
    return value;
  }
  return "openai";
}

function generationProvider(provider: string | null | undefined): LlmProvider {
  const normalized = normalizeProviderName(provider);
  if (aiExecutionMode() === "real" && normalized === "mock")
    throw new LlmConfigurationError("mock", "Real demo mode requires a real generation provider.");
  if (normalized === "mock" && !shouldUseMockAi())
    throw new LlmConfigurationError("mock", "Simulated generation is disabled. Configure a real provider.");
  if (shouldUseMockAi() || normalized === "mock") {
    return mockProvider;
  }
  if (normalized === "gemini") return geminiProvider;
  if (normalized === "groq") return groqProvider;
  if (normalized === "azure") {
    return azureOpenAiProvider;
  }
  if (normalized === "anthropic") {
    return {
      generateGroundedAnswer: (input) => anthropicProvider.generateGroundedAnswer(input),
      embed: (texts, model, context?: LlmCallContext) =>
        openAiProvider.embed(texts, model, context),
    };
  }
  return openAiProvider;
}

export function getGenerationProvider(provider: string | null | undefined): LlmProvider {
  const selected = generationProvider(provider);
  return { embed: (...args) => selected.embed(...args), generateGroundedAnswer: async input => {
    const prepared = prepareGenerationInput(input);
    const decision = await runTurnModelCall(input.reservationExtraction ? "reservation_extract" : input.handoffReason ? "handoff_intake" : "answer",
      prepared.tokenEstimate, input.maxOutputTokens ?? 800, control => selected.generateGroundedAnswer({ ...prepared.input,
        signal: control.signal ?? input.signal, timeoutMs: Math.min(input.timeoutMs ?? 25000, control.timeoutMs ?? Infinity) }));
    return { ...decision, contextChunkIds: prepared.input.retrievedChunks.map(chunk => chunk.id),
      promptTokenEstimate: prepared.tokenEstimate, promptHash: prepared.hash };
  } };
}

function embeddingProvider(provider: string | null | undefined): LlmProvider {
  const normalized = normalizeProviderName(provider);
  if (aiExecutionMode() === "real" && normalized === "mock")
    throw new LlmConfigurationError("mock", "Real demo mode requires real embeddings.");
  if (shouldUseMockAi() || normalized === "mock") {
    return mockProvider;
  }
  if (normalized === "gemini") return geminiProvider;
  if (normalized === "groq") return new UnsupportedEmbeddingProvider(normalized);
  if (normalized === "azure") {
    return azureOpenAiProvider;
  }
  if (normalized === "anthropic") {
    return new UnsupportedEmbeddingProvider(normalized);
  }
  return openAiProvider;
}

export function getEmbeddingProvider(provider: string | null | undefined): LlmProvider {
  const selected = embeddingProvider(provider);
  return { generateGroundedAnswer: input => selected.generateGroundedAnswer(input),
    embed: (texts, model, context = {}) => runTurnModelCall("embedding", estimateTokens(texts.join("\n")), 0,
      control => selected.embed(texts, model, { ...context, signal: control.signal ?? context.signal,
        timeoutMs: Math.min(context.timeoutMs ?? 25000, control.timeoutMs ?? Infinity) })) };
}
