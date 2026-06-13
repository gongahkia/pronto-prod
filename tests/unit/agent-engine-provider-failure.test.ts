import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  transaction: vi.fn(),
  getEmbeddingProvider: vi.fn(),
  getGenerationProvider: vi.fn(),
  embed: vi.fn(),
  generateGroundedAnswer: vi.fn(),
  failoverModelChoices: vi.fn(),
  canCallProvider: vi.fn(),
  recordProviderFailure: vi.fn(),
  recordProviderSuccess: vi.fn(),
  retrieveKnowledge: vi.fn(),
  recordAgentUsageEvent: vi.fn(),
  traceFinalize: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  query: mocks.query,
  transaction: mocks.transaction,
}));

vi.mock("@/lib/agent/guardrails", () => ({
  evaluateAiDisclosure: () => ({ shouldDisclose: false, answer: null }),
  evaluatePreGenerationGuardrails: () => ({
    shouldEscalate: false,
    reasonCode: "in_scope",
    reasonDetail: "In scope.",
    confidence: 1,
  }),
  evaluateRetrievalConfidence: () => ({
    shouldEscalate: false,
    reasonCode: "grounded_answer",
    reasonDetail: "Enough source confidence.",
    confidence: 0.9,
  }),
  evaluateSmallTalkGreeting: () => ({ shouldAnswer: false, answer: null }),
}));

vi.mock("@/lib/agent/self-check", () => ({
  evaluatePostGenerationSelfCheck: () => ({
    passed: true,
    reasonCode: "passed",
    reasonDetail: "Passed.",
    confidence: 1,
  }),
}));

vi.mock("@/lib/agent/trace", () => ({
  AgentTraceBuilder: vi.fn(function AgentTraceBuilder() {
    return {
      addStep: vi.fn(),
      finalize: mocks.traceFinalize,
    };
  }),
}));

vi.mock("@/lib/agent/integration-tools", () => ({
  integrationResultsToKnowledgeChunks: () => [],
  runIntegrationsForMessage: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/brand-voice", () => ({
  getPromptBrandVoiceProfile: vi.fn().mockResolvedValue({
    document: null,
    examples: [],
  }),
}));

vi.mock("@/lib/costing", () => ({
  estimateEmbeddingCost: () => ({ costUsd: 0 }),
  estimateGenerationCost: () => ({ costUsd: 0 }),
  estimateGenerationCostFromTokens: () => ({ costUsd: 0 }),
  recordAgentUsageEvent: mocks.recordAgentUsageEvent,
}));

vi.mock("@/lib/agent/runtime-limits", () => ({
  agentMaxConversationTokens: () => 10000,
  agentMaxOutputTokens: () => 500,
  agentMaxPromptTokens: () => 8000,
  agentTimeoutMs: () => 1000,
}));

vi.mock("@/lib/knowledge/chunk", () => ({
  estimateTokens: () => 100,
}));

vi.mock("@/lib/knowledge/retrieve", () => ({
  retrieveKnowledge: mocks.retrieveKnowledge,
}));

vi.mock("@/lib/knowledge/query", () => ({
  normalizeKnowledgeQuery: () => ({
    embeddingText: "opening hours",
    searchQuery: "opening hours",
    categories: ["hours"],
  }),
}));

vi.mock("@/lib/env", () => ({
  appBaseUrl: () => "https://pronto.test",
}));

vi.mock("@/lib/llm", () => ({
  getEmbeddingProvider: mocks.getEmbeddingProvider,
  getGenerationProvider: mocks.getGenerationProvider,
}));

vi.mock("@/lib/llm/catalog", () => ({
  failoverModelChoices: mocks.failoverModelChoices,
  selectModel: () => ({
    provider: "openai",
    model: "gpt-5.5",
    costLabel: "standard",
  }),
}));

vi.mock("@/lib/llm/circuit-breaker", () => ({
  canCallProvider: mocks.canCallProvider,
  recordProviderFailure: mocks.recordProviderFailure,
  recordProviderSuccess: mocks.recordProviderSuccess,
}));

vi.mock("@/lib/llm/prompt", () => ({
  buildGroundedAnswerInstructions: () => "instructions",
  buildGroundedAnswerUserInput: () => "user",
}));

vi.mock("@/lib/logger", () => ({
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  redactErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
}));

import { runAgentForMessage } from "@/lib/agent/engine";

describe("agent engine provider failures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("from clients")) {
        return { rows: [{ id: "client-1", name: "Client", brand_voice: "Concise" }] };
      }
      if (sql.includes("from agent_configs")) {
        return {
          rows: [
            {
              client_id: "client-1",
              prompt_preamble: "Answer from sources.",
              escalation_rules: {},
              retrieval_threshold: "0.05",
              response_provider: "openai",
              response_model: "gpt-5.5",
              embedding_provider: "openai",
              embedding_model: "text-embedding-3-small",
            },
          ],
        };
      }
      if (sql.includes("from messages")) {
        return { rows: [] };
      }
      return { rows: [] };
    });
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        query: vi.fn(async (sql: string) => {
          if (sql.includes("insert into escalations")) {
            return { rows: [{ id: "escalation-1" }] };
          }
          return { rows: [] };
        }),
      }),
    );
    mocks.getEmbeddingProvider.mockReturnValue({ embed: mocks.embed });
    mocks.getGenerationProvider.mockReturnValue({
      generateGroundedAnswer: mocks.generateGroundedAnswer,
    });
    mocks.canCallProvider.mockReturnValue(true);
    mocks.failoverModelChoices.mockReturnValue([
      { provider: "anthropic", model: "claude-haiku-4-5", costLabel: "low" },
    ]);
    mocks.retrieveKnowledge.mockResolvedValue([
      {
        id: "chunk-1",
        source_id: "source-1",
        client_id: "client-1",
        chunk_index: 0,
        content: "Opening hours are 10 AM to 10 PM.",
        token_estimate: 12,
        score: 0.9,
        metadata: {},
      },
    ]);
  });

  it("creates an escalation when embeddings fail before retrieval", async () => {
    mocks.embed.mockRejectedValueOnce(new Error("embedding provider down"));

    const result = await runAgentForMessage(agentInput());

    expect(result).toMatchObject({
      action: "escalated",
      reasonCode: "provider_error",
      escalationId: "escalation-1",
    });
    expect(mocks.transaction).toHaveBeenCalled();
    expect(mocks.traceFinalize).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "escalated",
        reasonCode: "provider_error",
        errorMessage: "embedding provider down",
      }),
    );
  });

  it("creates an escalation when generation failover is exhausted", async () => {
    mocks.embed.mockResolvedValueOnce([[0.1]]);
    mocks.generateGroundedAnswer.mockRejectedValue(new Error("generation unavailable"));

    const result = await runAgentForMessage(agentInput());

    expect(result).toMatchObject({
      action: "escalated",
      reasonCode: "provider_error",
      escalationId: "escalation-1",
    });
    expect(mocks.recordProviderFailure).toHaveBeenCalledWith("openai");
    expect(mocks.recordProviderFailure).toHaveBeenCalledWith("anthropic");
    expect(mocks.recordProviderSuccess).not.toHaveBeenCalled();
    expect(mocks.traceFinalize).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "escalated",
        reasonCode: "provider_error",
        errorMessage: "generation unavailable",
      }),
    );
  });
});

function agentInput() {
  return {
    clientId: "client-1",
    channelId: "channel-1",
    conversationId: "conversation-1",
    customerMessageId: "message-1",
    customerMessage: "Are you open today?",
    requestId: "req_12345678",
  };
}
