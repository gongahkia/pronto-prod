import {
  evaluateAiDisclosure,
  evaluatePreGenerationGuardrails,
  evaluateRetrievalConfidence,
  evaluateSmallTalkGreeting,
} from "@/lib/agent/guardrails";
import { evaluatePostGenerationSelfCheck } from "@/lib/agent/self-check";
import { retrieveDraftKnowledge, type AssistantDraft } from "@/lib/assistant-drafts";
import {
  agentMaxConversationTokens,
  agentMaxOutputTokens,
  agentMaxPromptTokens,
  agentTimeoutMs,
} from "@/lib/agent/runtime-limits";
import {
  integrationResultsToKnowledgeChunks,
  runIntegrationsForMessage,
} from "@/lib/agent/integration-tools";
import { getPromptBrandVoiceProfile } from "@/lib/brand-voice";
import { getEscalationHoldingReply } from "@/lib/channels/escalation-handoff";
import { query } from "@/lib/db";
import { estimateTokens } from "@/lib/knowledge/chunk";
import { normalizeKnowledgeQuery } from "@/lib/knowledge/query";
import { retrieveKnowledge } from "@/lib/knowledge/retrieve";
import { getEmbeddingProvider, getGenerationProvider } from "@/lib/llm";
import { selectModel } from "@/lib/llm/catalog";
import { compileTriageFlowToEscalationRules } from "@/lib/triage-flow";
import { redactErrorMessage } from "@/lib/logger";
import type { AgentConfig, Channel, Client, KnowledgeChunk } from "@/lib/types";

export type AgentPreviewMessage = {
  senderRole: "customer" | "agent";
  body: string;
};

export type AgentPreviewResult = {
  action: "answered" | "escalated";
  responseText: string;
  reasonCode: string;
  reasonDetail: string;
  confidence: number;
  citedChunks: KnowledgeChunk[];
};

export async function previewAgentReply(input: {
  clientId: string;
  channel: Channel;
  customerMessage: string;
  history?: AgentPreviewMessage[];
  requestId?: string;
  draft?: AssistantDraft | null;
}): Promise<AgentPreviewResult> {
  const [clientResult, configResult, brandVoiceProfile] = await Promise.all([
    query<Client>("select * from clients where id = $1", [input.clientId]),
    query<AgentConfig>("select * from agent_configs where client_id = $1", [input.clientId]),
    getPromptBrandVoiceProfile(input.clientId),
  ]);
  const client = clientResult.rows[0];
  const config = configResult.rows[0];
  if (!client || !config) {
    throw new Error("Agent cannot run without client and config records.");
  }

  const smallTalkGreeting = evaluateSmallTalkGreeting(input.customerMessage, client.name);
  if (smallTalkGreeting.shouldAnswer && smallTalkGreeting.answer) {
    return answer(smallTalkGreeting.answer, "small_talk_greeting", "Standalone greeting.", 1);
  }

  const aiDisclosure = evaluateAiDisclosure(input.customerMessage, client.name);
  if (aiDisclosure.shouldDisclose && aiDisclosure.answer) {
    return answer(aiDisclosure.answer, "ai_disclosure", "Customer directly asked whether the agent is AI or human.", 1);
  }

  const escalationRules = input.draft?.flow
    ? compileTriageFlowToEscalationRules(input.draft.flow.nodes)
    : config.escalation_rules;
  const precheck = evaluatePreGenerationGuardrails(
    input.customerMessage,
    escalationRules,
    input.channel.kind,
  );
  if (precheck.shouldEscalate) {
    return escalation(input.channel, precheck.reasonCode, precheck.reasonDetail, precheck.confidence);
  }

  const responseProvider =
    process.env.PRONTO_LLM_PROVIDER ?? config.response_provider ?? "openai";
  const embeddingProvider =
    process.env.PRONTO_EMBEDDING_PROVIDER ?? config.embedding_provider;
  const embeddingModel =
    process.env.PRONTO_EMBEDDING_MODEL ?? config.embedding_model;
  const responseModel = selectModel({
    provider: responseProvider,
    configuredModel: config.response_model,
    task: "agent_answer",
  });

  const normalizedKnowledgeQuery = normalizeKnowledgeQuery(input.customerMessage);
  let embedding: number[];
  try {
    [embedding] = await getEmbeddingProvider(embeddingProvider).embed(
      [normalizedKnowledgeQuery.embeddingText],
      embeddingModel,
      {
        requestId: input.requestId,
        clientId: input.clientId,
        operation: "embedding",
      },
    );
  } catch (error) {
    return escalation(
      input.channel,
      "provider_error",
      `Embedding provider failed before retrieval: ${redactErrorMessage(error)}`,
      0,
    );
  }

  const excludedSourceIds = Object.keys(input.draft?.knowledge_changes ?? {});
  const staticChunks = await retrieveKnowledge(input.clientId, embedding, 5, {
    requestId: input.requestId,
    queryText: normalizedKnowledgeQuery.searchQuery,
    embeddingModel,
    excludeSourceIds: excludedSourceIds,
  });
  const draftChunks = input.draft
    ? await retrieveDraftKnowledge(input.clientId, embedding, embeddingModel, normalizedKnowledgeQuery.searchQuery, 5)
    : [];
  const integrationResults = await runIntegrationsForMessage({
    clientId: input.clientId,
    message: input.customerMessage,
    requestId: input.requestId,
  });
  const chunks = [
    ...integrationResultsToKnowledgeChunks(input.clientId, integrationResults),
    ...staticChunks,
    ...draftChunks,
  ].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 5);
  const retrievalThreshold = Number(config.retrieval_threshold);
  const retrievalCheck = evaluateRetrievalConfidence(chunks[0]?.score, retrievalThreshold);
  if (retrievalCheck.shouldEscalate) {
    return escalation(
      input.channel,
      retrievalCheck.reasonCode,
      retrievalCheck.reasonDetail,
      retrievalCheck.confidence,
      chunks,
    );
  }

  const recentMessages = (input.history ?? []).slice(-8);
  const conversationTokenEstimate = estimateTokens(
    [
      input.customerMessage,
      ...recentMessages.map((message) => message.body),
      ...chunks.map((chunk) => chunk.content),
    ].join("\n"),
  );
  if (conversationTokenEstimate > agentMaxConversationTokens()) {
    return escalation(
      input.channel,
      "context_budget_exceeded",
      `Estimated context ${conversationTokenEstimate} tokens exceeds the configured agent cap.`,
      1,
      chunks,
    );
  }

  let decision;
  try {
    decision = await getGenerationProvider(responseModel.provider).generateGroundedAnswer({
      requestId: input.requestId,
      clientId: input.clientId,
      clientName: client.name,
      brandVoice: input.draft?.voice?.content ?? client.brand_voice,
      brandVoiceDocument: input.draft?.voice?.content ?? brandVoiceProfile.document?.content ?? null,
      fewShotExamples: input.draft?.voice
        ? input.draft.voice.examples.filter((example) => example.active).map((example) => ({
            customerMessage: example.customerMessage,
            idealResponse: example.idealResponse,
            notes: example.notes,
          }))
        : brandVoiceProfile.examples.map((example) => ({
            customerMessage: example.customer_message,
            idealResponse: example.ideal_response,
            notes: example.notes,
          })),
      promptPreamble: config.prompt_preamble,
      customerMessage: input.customerMessage,
      recentMessages,
      retrievedChunks: chunks,
      responseModel: responseModel.model,
      maxOutputTokens: agentMaxOutputTokens(),
      timeoutMs: agentTimeoutMs(),
      maxPromptTokens: agentMaxPromptTokens(),
    });
  } catch (error) {
    return escalation(
      input.channel,
      "provider_error",
      `Generation provider failed: ${redactErrorMessage(error)}`,
      0,
      chunks,
    );
  }

  const citedChunks = chunks.filter((chunk) => decision.citedChunkIds.includes(chunk.id));
  const selfCheck = evaluatePostGenerationSelfCheck({ decision, retrievedChunks: chunks });
  if (!selfCheck.passed) {
    return escalation(input.channel, selfCheck.reasonCode, selfCheck.reasonDetail, selfCheck.confidence, chunks);
  }
  if (decision.action === "escalate" || !decision.answer || !citedChunks.length) {
    return escalation(
      input.channel,
      decision.reasonCode,
      decision.action === "answer" && !citedChunks.length
        ? "The answer had no valid source chunk citation."
        : decision.reasonDetail,
      decision.confidence,
      chunks,
    );
  }

  return {
    action: "answered",
    responseText: decision.answer,
    reasonCode: decision.reasonCode,
    reasonDetail: decision.reasonDetail,
    confidence: decision.confidence,
    citedChunks,
  };
}

function answer(
  responseText: string,
  reasonCode: string,
  reasonDetail: string,
  confidence: number,
): AgentPreviewResult {
  return {
    action: "answered",
    responseText,
    reasonCode,
    reasonDetail,
    confidence,
    citedChunks: [],
  };
}

function escalation(
  channel: Channel,
  reasonCode: string,
  reasonDetail: string,
  confidence: number,
  citedChunks: KnowledgeChunk[] = [],
): AgentPreviewResult {
  return {
    action: "escalated",
    responseText: getEscalationHoldingReply(channel.settings),
    reasonCode,
    reasonDetail,
    confidence,
    citedChunks,
  };
}
