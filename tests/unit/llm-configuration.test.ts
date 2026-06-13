import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveProviderApiKey: vi.fn(),
}));

vi.mock("@/lib/llm/credentials", () => ({
  resolveProviderApiKey: mocks.resolveProviderApiKey,
}));

vi.mock("@/lib/logger", () => ({
  logInfo: vi.fn(),
  logWarn: vi.fn(),
}));

import { OpenAiProvider } from "@/lib/llm/openai";
import { AnthropicProvider } from "@/lib/llm/anthropic";
import { getEmbeddingProvider } from "@/lib/llm";
import { LlmConfigurationError } from "@/lib/llm/errors";

describe("LLM provider configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("fails OpenAI embeddings when live mode has no credential", async () => {
    vi.stubEnv("PRONTO_USE_MOCK_AI", "0");
    mocks.resolveProviderApiKey.mockResolvedValueOnce(null);

    await expect(new OpenAiProvider().embed(["hello"], "text-embedding-3-small")).rejects.toBeInstanceOf(
      LlmConfigurationError,
    );
  });

  it("fails Anthropic generation when live mode has no credential", async () => {
    vi.stubEnv("PRONTO_USE_MOCK_AI", "0");
    mocks.resolveProviderApiKey.mockResolvedValueOnce(null);

    await expect(
      new AnthropicProvider().generateGroundedAnswer({
        clientName: "Client",
        brandVoice: "Concise",
        promptPreamble: "Answer from sources.",
        customerMessage: "Question",
        recentMessages: [],
        retrievedChunks: [],
        responseModel: "claude-opus-4-1",
      }),
    ).rejects.toBeInstanceOf(LlmConfigurationError);
  });

  it("does not silently mock unsupported compatible-provider embeddings", async () => {
    vi.stubEnv("PRONTO_USE_MOCK_AI", "0");

    await expect(
      getEmbeddingProvider("groq").embed(["hello"], "text-embedding-3-small"),
    ).rejects.toBeInstanceOf(LlmConfigurationError);
  });
});
