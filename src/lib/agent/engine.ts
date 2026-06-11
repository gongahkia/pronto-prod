import { randomUUID } from "node:crypto";
import { query, transaction } from "@/lib/db";
import {
  evaluateAiDisclosure,
  evaluatePreGenerationGuardrails,
  evaluateRetrievalConfidence,
  evaluateSmallTalkGreeting,
} from "@/lib/agent/guardrails";
import { evaluatePostGenerationSelfCheck } from "@/lib/agent/self-check";
import { AgentTraceBuilder } from "@/lib/agent/trace";
import {
  integrationResultsToKnowledgeChunks,
  runIntegrationsForMessage,
} from "@/lib/agent/integration-tools";
import { getPromptBrandVoiceProfile } from "@/lib/brand-voice";
import {
  estimateEmbeddingCost,
  estimateGenerationCost,
  recordAgentUsageEvent,
} from "@/lib/costing";
import { retrieveKnowledge } from "@/lib/knowledge/retrieve";
import { normalizeKnowledgeQuery } from "@/lib/knowledge/query";
import { appBaseUrl } from "@/lib/env";
import { getEmbeddingProvider, getGenerationProvider } from "@/lib/llm";
import { failoverModelChoice, selectModel } from "@/lib/llm/catalog";
import {
  buildGroundedAnswerInstructions,
  buildGroundedAnswerUserInput,
} from "@/lib/llm/prompt";
import { logInfo, logWarn } from "@/lib/logger";
import type { GroundedAnswerDecision } from "@/lib/llm/types";
import type { AgentConfig, Client, KnowledgeChunk, Message } from "@/lib/types";

export type AgentRunResult = {
  action: "answered" | "escalated";
  responseText: string | null;
  reasonCode: string;
  reasonDetail: string;
  confidence: number;
  citedChunks: KnowledgeChunk[];
  agentMessageId?: string;
  escalationId?: string;
  csatUrl?: string;
};

export async function runAgentForMessage(input: {
  clientId: string;
  channelId: string;
  conversationId: string;
  customerMessageId: string;
  customerMessage: string;
  requestId?: string;
}): Promise<AgentRunResult> {
  logInfo("agent.run_started", {
    requestId: input.requestId,
    clientId: input.clientId,
    channelId: input.channelId,
    conversationId: input.conversationId,
    customerMessageId: input.customerMessageId,
  });

  const trace = new AgentTraceBuilder({
    clientId: input.clientId,
    conversationId: input.conversationId,
    customerMessageId: input.customerMessageId,
    requestId: input.requestId,
  });
  trace.addStep("run_started");

  const [clientResult, configResult, recentMessagesResult, brandVoiceProfile] = await Promise.all([
    query<Client>("select * from clients where id = $1", [input.clientId]),
    query<AgentConfig>("select * from agent_configs where client_id = $1", [
      input.clientId,
    ]),
    query<Message>(
      `
        select * from messages
        where conversation_id = $1
        order by created_at desc
        limit 8
      `,
      [input.conversationId],
    ),
    getPromptBrandVoiceProfile(input.clientId),
  ]);

  const client = clientResult.rows[0];
  const config = configResult.rows[0];
  if (!client || !config) {
    throw new Error("Agent cannot run without client and config records.");
  }

  const smallTalkGreeting = evaluateSmallTalkGreeting(
    input.customerMessage,
    client.name,
  );
  if (smallTalkGreeting.shouldAnswer && smallTalkGreeting.answer) {
    logInfo("agent.small_talk_greeting_answered", {
      requestId: input.requestId,
      clientId: input.clientId,
      channelId: input.channelId,
      conversationId: input.conversationId,
      customerMessageId: input.customerMessageId,
    });
    const recorded = await recordDirectAgentAnswer(input, {
      answer: smallTalkGreeting.answer,
      confidence: 1,
      reasonCode: "small_talk_greeting",
      metadata: {
        policy: "safe_small_talk",
      },
    });
    trace.addStep("small_talk_greeting_answered");
    await trace.finalize({
      status: "answered",
      reasonCode: "small_talk_greeting",
      confidence: 1,
      agentMessageId: recorded.agentMessageId,
    });

    return {
      action: "answered",
      responseText: smallTalkGreeting.answer,
      reasonCode: "small_talk_greeting",
      reasonDetail:
        "Customer sent a standalone greeting, so the agent answered without retrieval.",
      confidence: 1,
      citedChunks: [],
      agentMessageId: recorded.agentMessageId,
      csatUrl: recorded.csatUrl,
    };
  }

  const aiDisclosure = evaluateAiDisclosure(input.customerMessage, client.name);
  if (aiDisclosure.shouldDisclose && aiDisclosure.answer) {
    logInfo("agent.ai_disclosure_answered", {
      requestId: input.requestId,
      clientId: input.clientId,
      channelId: input.channelId,
      conversationId: input.conversationId,
      customerMessageId: input.customerMessageId,
    });
    const recorded = await recordDirectAgentAnswer(input, {
      answer: aiDisclosure.answer,
      confidence: 1,
      reasonCode: "ai_disclosure",
      metadata: {
        policy: "direct_customer_disclosure",
      },
    });
    trace.addStep("ai_disclosure_answered");
    await trace.finalize({
      status: "answered",
      reasonCode: "ai_disclosure",
      confidence: 1,
      agentMessageId: recorded.agentMessageId,
    });

    return {
      action: "answered",
      responseText: aiDisclosure.answer,
      reasonCode: "ai_disclosure",
      reasonDetail: "Customer directly asked whether the agent is AI or human.",
      confidence: 1,
      citedChunks: [],
      agentMessageId: recorded.agentMessageId,
      csatUrl: recorded.csatUrl,
    };
  }

  const precheck = evaluatePreGenerationGuardrails(
    input.customerMessage,
    config.escalation_rules,
  );
  if (precheck.shouldEscalate) {
    logInfo("agent.pre_generation_escalated", {
      requestId: input.requestId,
      clientId: input.clientId,
      channelId: input.channelId,
      conversationId: input.conversationId,
      customerMessageId: input.customerMessageId,
      reasonCode: precheck.reasonCode,
      confidence: precheck.confidence,
    });
    trace.addStep("pre_generation_escalated", {
      reasonCode: precheck.reasonCode,
      confidence: precheck.confidence,
    });
    const escalation = await createEscalation({
      ...input,
      reasonCode: precheck.reasonCode,
      reasonDetail: precheck.reasonDetail,
      confidence: precheck.confidence,
    });
    await trace.finalize({
      status: "escalated",
      reasonCode: precheck.reasonCode,
      confidence: precheck.confidence,
      escalationId: escalation.escalationId,
    });
    return escalation;
  }

  const responseProvider =
    process.env.PRONTO_LLM_PROVIDER ?? config.response_provider ?? "openai";
  const responseModel = selectModel({
    provider: responseProvider,
    configuredModel: config.response_model,
    task: "agent_answer",
  });

  logInfo("agent.provider_selected", {
    requestId: input.requestId,
    clientId: input.clientId,
    channelId: input.channelId,
    conversationId: input.conversationId,
    responseProvider: responseModel.provider,
    responseModel: responseModel.model,
    embeddingProvider: config.embedding_provider,
    embeddingModel: config.embedding_model,
  });
  trace.addStep("provider_selected", {
    responseProvider: responseModel.provider,
    responseModel: responseModel.model,
    embeddingProvider: config.embedding_provider,
    embeddingModel: config.embedding_model,
  });

  const normalizedKnowledgeQuery = normalizeKnowledgeQuery(input.customerMessage);
  const [embedding] = await getEmbeddingProvider(config.embedding_provider).embed(
    [normalizedKnowledgeQuery.embeddingText],
    config.embedding_model,
    {
      requestId: input.requestId,
      clientId: input.clientId,
      conversationId: input.conversationId,
      operation: "embedding",
    },
  );
  await safeRecordUsage({
    clientId: input.clientId,
    conversationId: input.conversationId,
    channelId: input.channelId,
    provider: config.embedding_provider,
    model: config.embedding_model,
    operation: "embedding",
    estimate: estimateEmbeddingCost(normalizedKnowledgeQuery.embeddingText),
    metadata: {
      requestId: input.requestId,
      customerMessageId: input.customerMessageId,
      normalizedKnowledgeCategories: normalizedKnowledgeQuery.categories,
    },
  });
  const staticChunks = await retrieveKnowledge(input.clientId, embedding, 5, {
    requestId: input.requestId,
    conversationId: input.conversationId,
    queryText: normalizedKnowledgeQuery.searchQuery,
    embeddingModel: config.embedding_model,
  });
  const integrationResults = await runIntegrationsForMessage({
    clientId: input.clientId,
    message: input.customerMessage,
    requestId: input.requestId,
  });
  if (integrationResults.length) {
    trace.addStep("integration_tools_invoked", {
      providers: integrationResults.map((result) => result.provider),
    });
  }
  const integrationChunks = integrationResultsToKnowledgeChunks(
    input.clientId,
    integrationResults,
  );
  const chunks = [...integrationChunks, ...staticChunks];
  const retrievalThreshold = Number(config.retrieval_threshold);
  const retrievalCheck = evaluateRetrievalConfidence(
    chunks[0]?.score,
    retrievalThreshold,
  );
  logInfo("agent.retrieval_evaluated", {
    requestId: input.requestId,
    clientId: input.clientId,
    channelId: input.channelId,
    conversationId: input.conversationId,
    customerMessageId: input.customerMessageId,
    topScore: chunks[0]?.score ?? null,
    threshold: retrievalThreshold,
    shouldEscalate: retrievalCheck.shouldEscalate,
    reasonCode: retrievalCheck.reasonCode,
    normalizedKnowledgeCategories: normalizedKnowledgeQuery.categories,
  });
  trace.addStep("retrieval_evaluated", {
    topScore: chunks[0]?.score ?? null,
    threshold: retrievalThreshold,
    chunkCount: chunks.length,
  });

  if (retrievalCheck.shouldEscalate) {
    const escalation = await createEscalation({
      ...input,
      reasonCode: retrievalCheck.reasonCode,
      reasonDetail: retrievalCheck.reasonDetail,
      confidence: retrievalCheck.confidence,
    });
    await trace.finalize({
      status: "escalated",
      reasonCode: retrievalCheck.reasonCode,
      confidence: retrievalCheck.confidence,
      responseProvider: responseModel.provider,
      responseModel: responseModel.model,
      embeddingProvider: config.embedding_provider,
      embeddingModel: config.embedding_model,
      retrievalTopScore: chunks[0]?.score ?? null,
      retrievalThreshold,
      retrievalChunks: chunks,
      escalationId: escalation.escalationId,
    });
    return escalation;
  }

  const generationInput = {
    requestId: input.requestId,
    clientId: input.clientId,
    conversationId: input.conversationId,
    clientName: client.name,
    brandVoice: client.brand_voice,
    brandVoiceDocument: brandVoiceProfile.document?.content ?? null,
    fewShotExamples: brandVoiceProfile.examples.map((example) => ({
      customerMessage: example.customer_message,
      idealResponse: example.ideal_response,
      notes: example.notes,
    })),
    promptPreamble: config.prompt_preamble,
    customerMessage: input.customerMessage,
    recentMessages: recentMessagesResult.rows.reverse().map((message) => ({
      senderRole: message.sender_role,
      body: message.body,
    })),
    retrievedChunks: chunks,
    responseModel: responseModel.model,
  };

  let decision: GroundedAnswerDecision;
  let usedFailover = false;
  let failoverProvider: string | undefined;
  let failoverModel: string | undefined;
  let failoverReason: string | undefined;
  try {
    decision = await getGenerationProvider(responseModel.provider).generateGroundedAnswer(
      generationInput,
    );
  } catch (error) {
    if (
      responseModel.provider === "openai" ||
      process.env.PRONTO_ENABLE_PROVIDER_FAILOVER === "0"
    ) {
      await trace.finalize({
        status: "escalated",
        reasonCode: "provider_error",
        confidence: 0,
        responseProvider: responseModel.provider,
        responseModel: responseModel.model,
        embeddingProvider: config.embedding_provider,
        embeddingModel: config.embedding_model,
        retrievalTopScore: chunks[0]?.score ?? null,
        retrievalThreshold,
        retrievalChunks: chunks,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    const fallback = failoverModelChoice();
    usedFailover = true;
    failoverProvider = fallback.provider;
    failoverModel = fallback.model;
    failoverReason = error instanceof Error ? error.message : String(error);
    logWarn("agent.provider_failover_started", {
      requestId: input.requestId,
      clientId: input.clientId,
      channelId: input.channelId,
      conversationId: input.conversationId,
      failedProvider: responseModel.provider,
      failedModel: responseModel.model,
      fallbackProvider: fallback.provider,
      fallbackModel: fallback.model,
      error,
    });
    trace.addStep("provider_failover", {
      failedProvider: responseModel.provider,
      failedModel: responseModel.model,
      fallbackProvider: fallback.provider,
      fallbackModel: fallback.model,
    });
    decision = await getGenerationProvider(fallback.provider).generateGroundedAnswer({
      ...generationInput,
      responseModel: fallback.model,
    });
  }

  const citedChunks = chunks.filter((chunk) =>
    decision.citedChunkIds.includes(chunk.id),
  );
  await safeRecordUsage({
    clientId: input.clientId,
    conversationId: input.conversationId,
    channelId: input.channelId,
    provider: responseModel.provider,
    model: responseModel.model,
    operation: "generation",
    estimate: estimateGenerationCost({
      inputText: `${buildGroundedAnswerInstructions(generationInput)}\n\n${buildGroundedAnswerUserInput(generationInput)}`,
      outputText: JSON.stringify(decision),
      costLabel: responseModel.costLabel,
    }),
    metadata: {
      requestId: input.requestId,
      customerMessageId: input.customerMessageId,
      reasonCode: decision.reasonCode,
    },
  });

  const selfCheck = evaluatePostGenerationSelfCheck({
    decision,
    retrievedChunks: chunks,
  });
  if (!selfCheck.passed) {
    logInfo("agent.self_check_escalated", {
      requestId: input.requestId,
      clientId: input.clientId,
      channelId: input.channelId,
      conversationId: input.conversationId,
      customerMessageId: input.customerMessageId,
      reasonCode: selfCheck.reasonCode,
      confidence: selfCheck.confidence,
    });
    trace.addStep("self_check_escalated", {
      reasonCode: selfCheck.reasonCode,
      confidence: selfCheck.confidence,
    });
    const escalation = await createEscalation({
      ...input,
      reasonCode: selfCheck.reasonCode,
      reasonDetail: selfCheck.reasonDetail,
      confidence: selfCheck.confidence,
    });
    await trace.finalize({
      status: "escalated",
      reasonCode: selfCheck.reasonCode,
      confidence: selfCheck.confidence,
      responseProvider: responseModel.provider,
      responseModel: responseModel.model,
      embeddingProvider: config.embedding_provider,
      embeddingModel: config.embedding_model,
      retrievalTopScore: chunks[0]?.score ?? null,
      retrievalThreshold,
      retrievalChunks: chunks,
      citedChunkIds: decision.citedChunkIds,
      promptText: `${buildGroundedAnswerInstructions(generationInput)}\n\n${buildGroundedAnswerUserInput(generationInput)}`,
      usedFailover,
      failoverProvider,
      failoverModel,
      failoverReason,
      escalationId: escalation.escalationId,
    });
    return escalation;
  }

  if (decision.action === "escalate" || !decision.answer || !citedChunks.length) {
    logInfo("agent.model_decision_escalated", {
      requestId: input.requestId,
      clientId: input.clientId,
      channelId: input.channelId,
      conversationId: input.conversationId,
      customerMessageId: input.customerMessageId,
      reasonCode: decision.reasonCode,
      confidence: decision.confidence,
      citedChunkCount: citedChunks.length,
    });
    trace.addStep("model_decision_escalated", {
      reasonCode: decision.reasonCode,
      confidence: decision.confidence,
      citedChunkCount: citedChunks.length,
    });
    const escalation = await createEscalation({
      ...input,
      reasonCode: decision.reasonCode,
      reasonDetail:
        decision.action === "answer" && !citedChunks.length
          ? "The answer had no valid source chunk citation."
          : decision.reasonDetail,
      confidence: decision.confidence,
    });
    await trace.finalize({
      status: "escalated",
      reasonCode: decision.reasonCode,
      confidence: decision.confidence,
      responseProvider: responseModel.provider,
      responseModel: responseModel.model,
      embeddingProvider: config.embedding_provider,
      embeddingModel: config.embedding_model,
      retrievalTopScore: chunks[0]?.score ?? null,
      retrievalThreshold,
      retrievalChunks: chunks,
      citedChunkIds: decision.citedChunkIds,
      promptText: `${buildGroundedAnswerInstructions(generationInput)}\n\n${buildGroundedAnswerUserInput(generationInput)}`,
      usedFailover,
      failoverProvider,
      failoverModel,
      failoverReason,
      escalationId: escalation.escalationId,
    });
    return escalation;
  }

  const csatUrl = buildCsatUrl(input.conversationId);
  const agentMessage = await query<{ id: string }>(
    `
      insert into messages (conversation_id, client_id, channel_id, external_message_id, sender_role, body, metadata)
      values ($1, $2, $3, $4, 'agent', $5, $6)
      returning id
    `,
    [
      input.conversationId,
      input.clientId,
      input.channelId,
      `agent-${randomUUID()}`,
      decision.answer,
      {
        confidence: decision.confidence,
        reasonCode: decision.reasonCode,
        citedChunkIds: decision.citedChunkIds,
        postGenerationSelfCheck: {
          reasonCode: selfCheck.reasonCode,
          reasonDetail: selfCheck.reasonDetail,
        },
        csatUrl,
      },
    ],
  );

  await query(
    "update conversations set status = 'active', last_message_at = now() where id = $1",
    [input.conversationId],
  );
  await query(
    "insert into metric_events (client_id, event_type, value, metadata) values ($1, 'agent_answered', $2, $3)",
    [input.clientId, decision.confidence, { citedChunkIds: decision.citedChunkIds }],
  );

  logInfo("agent.run_answered", {
    requestId: input.requestId,
    clientId: input.clientId,
    channelId: input.channelId,
    conversationId: input.conversationId,
    customerMessageId: input.customerMessageId,
    agentMessageId: agentMessage.rows[0].id,
    reasonCode: decision.reasonCode,
    confidence: decision.confidence,
    citedChunkCount: citedChunks.length,
  });
  trace.addStep("run_answered", {
    agentMessageId: agentMessage.rows[0].id,
    reasonCode: decision.reasonCode,
  });
  await trace.finalize({
    status: "answered",
    reasonCode: decision.reasonCode,
    confidence: decision.confidence,
    responseProvider: responseModel.provider,
    responseModel: responseModel.model,
    embeddingProvider: config.embedding_provider,
    embeddingModel: config.embedding_model,
    retrievalTopScore: chunks[0]?.score ?? null,
    retrievalThreshold,
    retrievalChunks: chunks,
    citedChunkIds: decision.citedChunkIds,
    promptText: `${buildGroundedAnswerInstructions(generationInput)}\n\n${buildGroundedAnswerUserInput(generationInput)}`,
    usedFailover,
    failoverProvider,
    failoverModel,
    failoverReason,
    agentMessageId: agentMessage.rows[0].id,
  });

  return {
    action: "answered",
    responseText: decision.answer,
    reasonCode: decision.reasonCode,
    reasonDetail: decision.reasonDetail,
    confidence: decision.confidence,
    citedChunks,
    agentMessageId: agentMessage.rows[0].id,
    csatUrl: `${csatUrl}?messageId=${agentMessage.rows[0].id}`,
  };
}

export async function createEscalation(input: {
  clientId: string;
  channelId: string;
  conversationId: string;
  customerMessageId: string;
  customerMessage: string;
  reasonCode: string;
  reasonDetail: string;
  confidence: number;
  requestId?: string;
}): Promise<AgentRunResult> {
  return transaction(async (client) => {
    await client.query(
      "update conversations set status = 'escalated', last_message_at = now() where id = $1",
      [input.conversationId],
    );

    const escalation = await client.query<{ id: string }>(
      `
        insert into escalations (client_id, conversation_id, message_id, reason_code, reason_detail, confidence)
        values ($1, $2, $3, $4, $5, $6)
        returning id
      `,
      [
        input.clientId,
        input.conversationId,
        input.customerMessageId,
        input.reasonCode,
        input.reasonDetail,
        input.confidence,
      ],
    );

    await client.query(
      "insert into metric_events (client_id, event_type, value, metadata) values ($1, 'agent_escalated', $2, $3)",
      [
        input.clientId,
        input.confidence,
        { reasonCode: input.reasonCode, conversationId: input.conversationId },
      ],
    );

    logInfo("agent.escalation_created", {
      requestId: input.requestId,
      clientId: input.clientId,
      channelId: input.channelId,
      conversationId: input.conversationId,
      customerMessageId: input.customerMessageId,
      escalationId: escalation.rows[0].id,
      reasonCode: input.reasonCode,
      confidence: input.confidence,
    });

    return {
      action: "escalated",
      responseText: null,
      reasonCode: input.reasonCode,
      reasonDetail: input.reasonDetail,
      confidence: input.confidence,
      citedChunks: [],
      escalationId: escalation.rows[0].id,
    };
  }, { isolationLevel: "serializable", retries: 2 });
}

async function recordDirectAgentAnswer(
  input: {
    clientId: string;
    channelId: string;
    conversationId: string;
    customerMessageId: string;
    requestId?: string;
  },
  output: {
    answer: string;
    confidence: number;
    reasonCode: string;
    metadata?: Record<string, unknown>;
  },
): Promise<{ agentMessageId: string; csatUrl: string }> {
  const csatUrl = buildCsatUrl(input.conversationId);
  const agentMessage = await query<{ id: string }>(
    `
      insert into messages (conversation_id, client_id, channel_id, external_message_id, sender_role, body, metadata)
      values ($1, $2, $3, $4, 'agent', $5, $6)
      returning id
    `,
    [
      input.conversationId,
      input.clientId,
      input.channelId,
      `agent-${randomUUID()}`,
      output.answer,
      {
        confidence: output.confidence,
        reasonCode: output.reasonCode,
        citedChunkIds: [],
        csatUrl,
        ...output.metadata,
      },
    ],
  );

  await query(
    "update conversations set status = 'active', last_message_at = now() where id = $1",
    [input.conversationId],
  );
  await query(
    "insert into metric_events (client_id, event_type, value, metadata) values ($1, 'agent_answered', $2, $3)",
    [
      input.clientId,
      output.confidence,
      {
        reasonCode: output.reasonCode,
        conversationId: input.conversationId,
      },
    ],
  );

  logInfo("agent.direct_answer_recorded", {
    requestId: input.requestId,
    clientId: input.clientId,
    channelId: input.channelId,
    conversationId: input.conversationId,
    customerMessageId: input.customerMessageId,
    agentMessageId: agentMessage.rows[0].id,
    reasonCode: output.reasonCode,
  });

  return {
    agentMessageId: agentMessage.rows[0].id,
    csatUrl: `${csatUrl}?messageId=${agentMessage.rows[0].id}`,
  };
}

async function safeRecordUsage(
  input: Parameters<typeof recordAgentUsageEvent>[0],
): Promise<void> {
  try {
    await recordAgentUsageEvent(input);
  } catch (error) {
    logWarn("agent_usage_record_failed", {
      clientId: input.clientId,
      conversationId: input.conversationId,
      operation: input.operation,
      requestId:
        typeof input.metadata?.requestId === "string"
          ? input.metadata.requestId
          : undefined,
      error,
    });
  }
}

function buildCsatUrl(conversationId: string): string {
  return `${appBaseUrl().replace(/\/$/, "")}/csat/${conversationId}`;
}
