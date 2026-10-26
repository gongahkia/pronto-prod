import { query } from "@/lib/db";
import { plainMessageText } from "@/lib/message-text";
import { shouldUseMockAi } from "@/lib/env";
import { getPromptBrandVoiceProfile } from "@/lib/brand-voice";
import { retrieveKnowledge, retrieveKnowledgeText } from "@/lib/knowledge/retrieve";
import { normalizeKnowledgeQuery } from "@/lib/knowledge/query";
import { estimateTokens } from "@/lib/knowledge/chunk";
import { getEmbeddingProvider, getGenerationProvider } from "@/lib/llm";
import { selectModel } from "@/lib/llm/catalog";
import { aiExecutionProfile, withAiExecutionProfile } from "@/lib/llm/execution-mode";
import { assertCustomerDemoEnabled, isCustomerDemoChannel } from "@/lib/customer-demo-boundary";
import { requireRealDemoConfiguration, storedDemoProfile } from "@/lib/customer-demo-ai";
import type { DemoAiProfile } from "@/lib/llm/demo-models";
import { evaluatePreGenerationGuardrails } from "@/lib/agent/guardrails";
import { evaluatePostGenerationSelfCheck } from "@/lib/agent/self-check";
import { agentMaxConversationTokens, agentMaxOutputTokens, agentMaxPromptTokens, agentTimeoutMs } from "@/lib/agent/runtime-limits";
import { buildGroundedAnswerInstructions, buildGroundedAnswerUserInput } from "@/lib/llm/prompt";
import { estimateEmbeddingCost, estimateGenerationCost, estimateGenerationCostFromTokens, recordAgentUsageEvent } from "@/lib/costing";
import { logInfo, logWarn, redactErrorMessage } from "@/lib/logger";
import type { AgentConfig, Channel, Client, Conversation, Escalation, Message } from "@/lib/types";

const intakeReasons = ["complaint_or_refund", "transactional_action", "private_lookup_unverified"];

export type HandoffIntakeReply = { body: string; metadata: Message["metadata"] };

// Generate one acknowledgement/intake question for the handoff. Ownership stays
// with staff; later customer details are saved without restarting the assistant.
export async function generateHandoffIntake(input: {
  channel: Channel; conversation: Conversation; escalation: Escalation; customerMessageId: string;
}): Promise<HandoffIntakeReply | null> {
  if (input.escalation.status !== "open" || input.escalation.reason_code === "provider_error") return null;
  try {
    if (isCustomerDemoChannel(input.channel)) {
      await assertCustomerDemoEnabled();
      const session = await query<{ ai_mode: "real" | "mock"; ai_selection: string; ai_configuration: DemoAiProfile | null }>(
        "select ai_mode,ai_selection,ai_configuration from customer_demo_sessions where client_id=$1 and conversation_id=$2",
        [input.channel.client_id, input.conversation.id]);
      if (session.rows[0]?.ai_mode !== "real") return null;
      const configuration = await requireRealDemoConfiguration(true, storedDemoProfile(session.rows[0]));
      return await withAiExecutionProfile({ mode: "real", syntheticDemo: true, provider: configuration.provider,
        model: configuration.model, embeddingProvider: configuration.embeddingProvider, embeddingModel: configuration.embeddingModel,
        ...(configuration.retrievalMode ? { retrievalMode: configuration.retrievalMode } : {}) }, () => generate(input));
    }
    if (shouldUseMockAi()) return null;
    return await generate(input);
  } catch (error) {
    // Intake failure must never block staff handoff or cause a provider fallback.
    logWarn("agent.handoff_intake_unavailable", { clientId: input.channel.client_id,
      conversationId: input.conversation.id, escalationId: input.escalation.id, error: redactErrorMessage(error) });
    return null;
  }
}

async function generate(input: Parameters<typeof generateHandoffIntake>[0]): Promise<HandoffIntakeReply | null> {
  const clientId = input.channel.client_id;
  const conversationId = input.conversation.id;
  const [clients, configs, recent, voice] = await Promise.all([
    query<Client>("select * from clients where id=$1", [clientId]),
    query<AgentConfig>("select * from agent_configs where client_id=$1", [clientId]),
    query<Message>("select * from messages where client_id=$1 and conversation_id=$2 order by created_at desc limit 8", [clientId, conversationId]),
    getPromptBrandVoiceProfile(clientId),
  ]);
  const client = clients.rows[0];
  const config = configs.rows[0];
  const customer = recent.rows.find(message => message.id === input.customerMessageId && message.sender_role === "customer");
  if (!client || !config || !customer) return null;
  const critical = evaluatePreGenerationGuardrails(customer.body, { ...config.escalation_rules,
    disabledReasonCodes: intakeReasons }, input.channel.kind);
  const askForDetails = !critical.shouldEscalate;

  const profile = aiExecutionProfile();
  const provider = profile?.provider ?? process.env.PRONTO_LLM_PROVIDER ?? config.response_provider;
  const selected = selectModel({ provider, configuredModel: profile?.model ?? config.response_model,
    ignoreEnvironment: Boolean(profile?.model), task: "agent_answer" });
  const localText = profile?.retrievalMode === "local_text";
  const normalized = normalizeKnowledgeQuery(customer.body);
  const embeddingProvider = profile?.embeddingProvider ?? process.env.PRONTO_EMBEDDING_PROVIDER ?? config.embedding_provider;
  const embeddingModel = profile?.embeddingModel ?? process.env.PRONTO_EMBEDDING_MODEL ?? config.embedding_model;
  let chunks = localText ? await retrieveKnowledgeText(clientId, normalized.searchQuery, 5, { conversationId })
    : await (async () => {
      const [vector] = await getEmbeddingProvider(embeddingProvider).embed([normalized.embeddingText], embeddingModel,
        { clientId, conversationId, operation: "embedding", embeddingTask: "query" });
      await recordUsage({ clientId, conversationId, channelId: input.channel.id, provider: embeddingProvider,
        model: embeddingModel, operation: "embedding", estimate: estimateEmbeddingCost(normalized.embeddingText) });
      return retrieveKnowledge(clientId, vector, 5, { conversationId, queryText: normalized.searchQuery,
        embeddingProvider, embeddingModel });
    })();
  if (!chunks.length && localText) chunks = await retrieveKnowledgeText(clientId, normalizeKnowledgeQuery(client.name).searchQuery, 5, { conversationId });
  if (!chunks.length || (chunks[0].score ?? 0) < Number(config.retrieval_threshold)) return null;
  if (estimateTokens([customer.body, ...recent.rows.map(message => message.body), ...chunks.map(chunk => chunk.content)].join("\n"))
      > agentMaxConversationTokens()) return null;

  const generationInput = {
    clientId, conversationId, clientName: client.name, brandVoice: client.brand_voice,
    brandVoiceDocument: voice.document?.content ?? null, promptPreamble: config.prompt_preamble,
    customerMessage: customer.body, recentMessages: [...recent.rows].reverse().map(message => ({ senderRole: message.sender_role, body: message.body })),
    retrievedChunks: chunks, responseModel: selected.model, maxOutputTokens: agentMaxOutputTokens(),
    maxPromptTokens: agentMaxPromptTokens(), timeoutMs: agentTimeoutMs(), handoffReason: input.escalation.reason_code,
    handoffAskForDetails: askForDetails,
    escalationRules: config.escalation_rules, channelKind: input.channel.kind,
  };
  const generated = await getGenerationProvider(selected.provider).generateGroundedAnswer(generationInput);
  const decision = { ...generated, answer: generated.answer ? plainMessageText(generated.answer) : null };
  const prompt = `${buildGroundedAnswerInstructions(generationInput)}\n${buildGroundedAnswerUserInput(generationInput)}`;
  await recordUsage({ clientId, conversationId, channelId: input.channel.id, provider: selected.provider, model: selected.model,
    operation: "generation", estimate: decision.usage ? estimateGenerationCostFromTokens({ ...decision.usage, costLabel: selected.costLabel })
      : estimateGenerationCost({ inputText: prompt, outputText: JSON.stringify(decision), costLabel: selected.costLabel }),
    metadata: { purpose: "handoff_intake", customerMessageId: customer.id, providerResponseId: decision.providerResponseId ?? null,
      usageSource: decision.usage ? "provider" : "estimate" } });
  // Validate source citations and mutation claims before sending intake text.
  // Optional questions may also be grounded in the customer's own description.
  const check = evaluatePostGenerationSelfCheck({ decision: { ...decision, action: "answer" }, retrievedChunks: chunks,
    clarificationContext: `${customer.body}\nOur team will review this enquiry. The assistant is paused.`,
    requireQuestion: false });
  if (decision.action !== "escalate" || !decision.answer?.trim() || !check.passed || (!askForDetails && /[?？]/.test(decision.answer))) {
    logInfo("agent.handoff_intake_rejected", { clientId, conversationId, action: decision.action,
      hasAnswer: Boolean(decision.answer?.trim()), reasonCode: check.reasonCode });
    return null;
  }
  const cited = chunks.filter(chunk => decision.citedChunkIds.includes(chunk.id));
  return { body: decision.answer.trim(), metadata: { generationMode: "real", responseProvider: selected.provider,
    responseModel: decision.actualModel ?? selected.model, providerResponseId: decision.providerResponseId ?? null,
    citedChunkIds: decision.citedChunkIds, retrievalMode: localText ? "local_text" : "hybrid_vector", handoffIntake: true,
    intakeContextChunkIds: chunks.map(chunk => chunk.id),
    sourceProvenance: cited.map(chunk => ({ chunkId: chunk.id, sourceId: chunk.source_id,
      version: chunk.metadata.sourceVersion ?? null, contentHash: chunk.metadata.sourceContentHash ?? null })) } };
}

async function recordUsage(input: Parameters<typeof recordAgentUsageEvent>[0]) {
  try { await recordAgentUsageEvent(input); }
  catch { logWarn("agent.handoff_usage_not_recorded", { clientId: input.clientId, conversationId: input.conversationId }); }
}
