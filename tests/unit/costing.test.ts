import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  query: mocks.query,
}));

import {
  estimateEmbeddingCost,
  estimateGenerationCost,
  formatSgd,
  recordAgentUsageEvent,
} from "@/lib/costing";

describe("costing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue({ rows: [] });
  });

  it("estimates generation and embedding costs from token estimates", () => {
    const generation = estimateGenerationCost({
      inputText: "verified source content ".repeat(200),
      outputText: "customer answer ".repeat(80),
      costLabel: "standard",
    });
    const embedding = estimateEmbeddingCost("customer question ".repeat(100));

    expect(generation.inputTokens).toBeGreaterThan(0);
    expect(generation.outputTokens).toBeGreaterThan(0);
    expect(generation.estimatedCostUsd).toBeGreaterThan(embedding.estimatedCostUsd);
    expect(formatSgd(1234.4)).toBe("SGD 1,234");
  });

  it("records structured agent usage rows", async () => {
    await recordAgentUsageEvent({
      clientId: "client-1",
      conversationId: "conversation-1",
      messageId: "message-1",
      channelId: "channel-1",
      provider: "openai",
      model: "gpt-5.5",
      operation: "generation",
      estimate: {
        inputTokens: 100,
        outputTokens: 20,
        estimatedCostUsd: 0.001,
      },
      metadata: { reasonCode: "grounded_answer" },
    });

    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining("insert into agent_usage_events"),
      [
        "client-1",
        "conversation-1",
        "message-1",
        "channel-1",
        "openai",
        "gpt-5.5",
        "generation",
        100,
        20,
        0.001,
        { reasonCode: "grounded_answer" },
      ],
    );
  });
});
