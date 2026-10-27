import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  transaction: vi.fn(),
  getEmbeddingProvider: vi.fn(),
  getGenerationProvider: vi.fn(),
  embed: vi.fn(),
  generateGroundedAnswer: vi.fn(),
  retrieveKnowledge: vi.fn(),
  recordAgentUsageEvent: vi.fn(),
  traceFinalize: vi.fn(),
  greeting: vi.fn(),
  disclosure: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  query: mocks.query,
  transaction: mocks.transaction,
}));

vi.mock("@/lib/agent/guardrails", async original => ({
  ...await original<typeof import("@/lib/agent/guardrails")>(),
  evaluateAiDisclosure: mocks.disclosure,
  evaluateRetrievalConfidence: () => ({
    shouldEscalate: false,
    reasonCode: "grounded_answer",
    reasonDetail: "Enough source confidence.",
    confidence: 0.9,
  }),
  evaluateSmallTalkGreeting: mocks.greeting,
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
  conversationKnowledgeQuery: () => ({ embeddingText: "opening hours", searchQuery: "opening hours", categories: ["hours"] }),
  normalizeKnowledgeQuery: () => ({
    embeddingText: "opening hours",
    searchQuery: "opening hours",
    categories: ["hours"],
  }),
}));

vi.mock("@/lib/env", () => ({
  appBaseUrl: () => "https://pronto.test",
  shouldUseMockAi: () => false,
}));

vi.mock("@/lib/llm", () => ({
  getEmbeddingProvider: mocks.getEmbeddingProvider,
  getGenerationProvider: mocks.getGenerationProvider,
}));

vi.mock("@/lib/llm/catalog", () => ({
  selectModel: () => ({
    provider: "openai",
    model: "gpt-5.5",
    costLabel: "standard",
  }),
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
    mocks.greeting.mockReturnValue({ shouldAnswer: false, answer: null });
    mocks.disclosure.mockReturnValue({ shouldDisclose: false, answer: null });
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
      if (sql.includes("insert into messages")) {
        return { rows: [{ id: "answer-1" }] };
      }
      return { rows: [] };
    });
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        query: vi.fn(async (sql: string) => {
          if (sql.includes("from messages") && sql.includes("for update")) {
            return { rows: [{ id: "message-1" }] };
          }
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

  it("creates an escalation when generation fails", async () => {
    mocks.embed.mockResolvedValueOnce([[0.1]]);
    mocks.generateGroundedAnswer.mockRejectedValue(new Error("generation unavailable"));

    const result = await runAgentForMessage(agentInput());

    expect(result).toMatchObject({
      action: "escalated",
      reasonCode: "provider_error",
      escalationId: "escalation-1",
    });
    expect(mocks.traceFinalize).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "escalated",
        reasonCode: "provider_error",
        errorMessage: "generation unavailable",
      }),
    );
  });

  it.each(["greeting", "disclosure"])("uses model inference for %s instead of its canned reply", async kind => {
    if (kind === "greeting") mocks.greeting.mockReturnValue({ shouldAnswer: true, answer: "Canned greeting" });
    else mocks.disclosure.mockReturnValue({ shouldDisclose: true, answer: "Canned disclosure" });
    mocks.embed.mockResolvedValue([[0.1]]);
    mocks.generateGroundedAnswer.mockResolvedValue({ action: "answer", answer: "The model's actual reply.",
      confidence: 0.9, reasonCode: "grounded_answer", reasonDetail: "Grounded.", citedChunkIds: ["chunk-1"], providerResponseId: "response-1" });
    const result = await runAgentForMessage({ ...agentInput(), customerMessage: kind === "greeting" ? "Hi" : "Are you an AI?" });
    expect(result).toMatchObject({ action: "answered", responseText: "The model's actual reply." });
    expect(mocks.generateGroundedAnswer).toHaveBeenCalledTimes(1);
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("insert into messages"), expect.arrayContaining([
      "The model's actual reply.", expect.objectContaining({ responseProvider: "openai", providerResponseId: "response-1" }),
    ]));
  });
  it.each(["What is your refund policy?", "My order is missing an item and I want a refund.", "Are you open now?"])("lets the model triage a business enquiry: %s", async customerMessage => {
    mocks.embed.mockResolvedValue([[0.1]]);
    mocks.generateGroundedAnswer.mockResolvedValue({ action: "escalate", answer: null, confidence: 0.9,
      reasonCode: "model_requires_staff", reasonDetail: "This request needs staff authority.", citedChunkIds: [] });
    expect(await runAgentForMessage({ ...agentInput(), customerMessage })).toMatchObject({ action: "escalated", reasonCode: "model_requires_staff" });
    expect(mocks.generateGroundedAnswer).toHaveBeenCalledTimes(1);
  });

  it("keeps the critical-issue check before model triage", async () => {
    expect(await runAgentForMessage({ ...agentInput(), customerMessage: "I want a refund after a severe allergy reaction." }))
      .toMatchObject({ action: "escalated", reasonCode: "medical_or_legal" });
    expect(mocks.generateGroundedAnswer).not.toHaveBeenCalled();
  });

  it("keeps customer private records behind the existing access check", async () => {
    expect(await runAgentForMessage({ ...agentInput(), customerMessage: "Where is my order #1234?" }))
      .toMatchObject({ action: "escalated", reasonCode: "private_lookup_unverified" });
    expect(mocks.generateGroundedAnswer).not.toHaveBeenCalled();
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
