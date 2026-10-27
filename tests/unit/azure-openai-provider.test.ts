import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  openAiConstructor: vi.fn(),
  responsesCreate: vi.fn(),
  embeddingsCreate: vi.fn(),
}));

vi.mock("openai", () => ({
  default: vi.fn(function OpenAI(options: unknown) {
    mocks.openAiConstructor(options);
    return {
      responses: { create: mocks.responsesCreate },
      embeddings: { create: mocks.embeddingsCreate },
    };
  }),
}));

import { AzureOpenAiProvider } from "@/lib/llm/azure";
import { normalizeProviderName } from "@/lib/llm";
import { selectModel } from "@/lib/llm/catalog";
import { envApiKeyForProvider } from "@/lib/llm/credentials";

describe("Azure OpenAI provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("PRONTO_USE_MOCK_AI", "0");
    vi.stubEnv("AZURE_OPENAI_API_KEY", "azure-key");
    vi.stubEnv("AZURE_OPENAI_ENDPOINT", "https://example.openai.azure.com");
    vi.stubEnv("AZURE_OPENAI_DEPLOYMENT", "gpt-5-deployment");
    vi.stubEnv("AZURE_OPENAI_EMBEDDING_DEPLOYMENT", "embedding-deployment");
    vi.stubEnv("AZURE_OPENAI_REASONING_EFFORT", "minimal");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("normalizes Azure and selects the configured deployment", () => {
    expect(normalizeProviderName("azure")).toBe("azure");
    expect(envApiKeyForProvider("azure")).toBe("azure-key");
    expect(selectModel({ provider: "azure", task: "agent_answer" })).toMatchObject({
      provider: "azure",
      model: "gpt-5-deployment",
    });
  });

  it("calls Azure Responses API through the OpenAI-compatible base URL", async () => {
    mocks.responsesCreate.mockResolvedValueOnce({
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                action: "answer",
                answer: "We are open.",
                confidence: 0.9,
                reasonCode: "grounded_answer",
                reasonDetail: "Answered from source.",
                citedChunkIds: ["chunk-1"],
              }),
            },
          ],
        },
      ],
      usage: { input_tokens: 10, output_tokens: 12 },
    });

    const provider = new AzureOpenAiProvider();
    const decision = await provider.generateGroundedAnswer({
      clientName: "North Bridge Nasi",
      brandVoice: "Concise",
      promptPreamble: "Answer from sources.",
      customerMessage: "Are you open?",
      recentMessages: [],
      responseModel: "ignored-model",
      retrievedChunks: [
        {
          id: "chunk-1",
          source_id: "source-1",
          client_id: "client-1",
          chunk_index: 0,
          content: "Opening hours are 10 AM to 10 PM.",
          token_estimate: 9,
          metadata: {},
        },
      ],
      maxOutputTokens: 128,
    });

    expect(mocks.openAiConstructor).toHaveBeenCalledWith({
      apiKey: "azure-key",
      maxRetries: 0,
      baseURL: "https://example.openai.azure.com/openai/v1/",
    });
    expect(mocks.responsesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5-deployment",
        max_output_tokens: 128,
        reasoning: { effort: "minimal" },
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(decision).toMatchObject({
      action: "answer",
      answer: "We are open.",
      usage: { inputTokens: 10, outputTokens: 12 },
    });
  });

  it("uses the Azure embedding deployment when embedding", async () => {
    mocks.embeddingsCreate.mockResolvedValueOnce({
      data: [{ embedding: [0.1, 0.2] }],
    });

    const provider = new AzureOpenAiProvider();
    const embeddings = await provider.embed(["opening hours"], "text-embedding-3-small");

    expect(mocks.embeddingsCreate).toHaveBeenCalledWith({
      model: "embedding-deployment",
      input: ["opening hours"],
    }, { signal: undefined, timeout: undefined });
    expect(embeddings).toEqual([[0.1, 0.2]]);
  });
});
