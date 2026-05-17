import { describe, expect, it } from "vitest";
import { deterministicEmbedding, mockGroundedAnswer } from "@/lib/llm/mock";

describe("mock provider", () => {
  it("creates stable normalized embeddings", () => {
    const first = deterministicEmbedding("opening hours");
    const second = deterministicEmbedding("opening hours");

    expect(first).toEqual(second);
    expect(first).toHaveLength(1536);
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
});

