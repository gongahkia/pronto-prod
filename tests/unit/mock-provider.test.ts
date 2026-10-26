import { afterEach, describe, expect, it, vi } from "vitest";
import { deterministicEmbedding, mockGroundedAnswer } from "@/lib/llm/mock";
import { getMockAiStatus } from "@/lib/llm/mock-status";
import { getGenerationProvider } from "@/lib/llm";

describe("mock provider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates stable normalized embeddings", () => {
    const first = deterministicEmbedding("opening hours");
    const second = deterministicEmbedding("opening hours");

    expect(first).toEqual(second);
    expect(first).toHaveLength(1536);
  });

  it("rejects a mock provider when real inference is enabled", () => {
    vi.stubEnv("PRONTO_USE_MOCK_AI", "0");
    expect(() => getGenerationProvider("mock")).toThrow();
  });

  it("answers only when a source is available", () => {
    const decision = mockGroundedAnswer({
      clientName: "North Bridge Nasi",
      brandVoice: "Warm and concise",
      promptPreamble: "Answer from sources.",
      customerMessage: "Are you open?",
      recentMessages: [],
      responseModel: "mock",
      retrievedChunks: [
        {
          id: "chunk-1",
          source_id: "source-1",
          client_id: "client-1",
          chunk_index: 0,
          content: "Opening hours are Monday to Friday from 11:00 AM to 9:30 PM.",
          token_estimate: 16,
          score: 0.8,
          metadata: {},
        },
      ],
    });

    expect(decision.action).toBe("answer");
    expect(decision.citedChunkIds).toEqual(["chunk-1"]);
  });

  it("does not hide explicit mock mode in production status", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PRONTO_USE_MOCK_AI", "1");

    expect(getMockAiStatus()).toMatchObject({
      active: true,
      reason: "PRONTO_USE_MOCK_AI=1",
    });
  });
});
