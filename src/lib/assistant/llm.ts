import OpenAI from "openai";
import { shouldUseMockAi } from "@/lib/env";
import { logInfo, logWarn } from "@/lib/logger";
import { normalizeProviderName } from "@/lib/llm";
import { getAzureOpenAiClient } from "@/lib/llm/azure";
import { selectModel } from "@/lib/llm/catalog";
import { resolveProviderApiKey } from "@/lib/llm/credentials";
import { LlmConfigurationError } from "@/lib/llm/errors";
import { freeProviderById, isFreeLlmProviderId } from "@/lib/llm/free-providers";
import { parseJsonObject } from "@/lib/llm/prompt";
import {
  assistantActionTypes,
  assistantGeneratedTurnSchema,
  type AssistantActionDraft,
  type AssistantContext,
  type AssistantGeneratedTurn,
} from "@/lib/assistant/types";

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
};

type AnthropicMessageResponse = {
  content?: Array<{ type: string; text?: string }>;
};

export async function generateAssistantTurn(input: {
  context: AssistantContext;
  message: string;
  requestId?: string;
}): Promise<AssistantGeneratedTurn> {
  const provider = normalizeProviderName(
    process.env.PRONTO_ASSISTANT_LLM_PROVIDER ?? process.env.PRONTO_LLM_PROVIDER,
  );
  const model =
    process.env.PRONTO_ASSISTANT_MODEL ??
    selectModel({ provider, task: "routing" }).model;

  if (shouldUseMockAi()) {
    return mockAssistantTurn(input.context, input.message);
  }

  if (provider === "mock") {
    return mockAssistantTurn(input.context, input.message);
  }
  if (provider === "anthropic") {
    return generateWithAnthropic({ ...input, model });
  }
  if (provider === "azure") {
    return generateWithAzure({ ...input, model });
  }
  if (provider === "openai") {
    return generateWithOpenAi({ ...input, model });
  }
  if (isFreeLlmProviderId(provider)) {
    return generateWithOpenAiCompatible({ ...input, provider, model });
  }
  throw new LlmConfigurationError(provider, "Unsupported assistant provider.");
}

function buildAssistantInstructions(context: AssistantContext): string {
  return `
You are Pronto's in-product operations copilot.

User role: ${context.user.role}
Role mode: ${context.roleMode}
Detected intent: ${context.intent}
Focused client: ${context.focusedClientName ?? context.focusedClientId ?? "none"}
Focused conversation: ${context.focusedConversationId ?? "none"}
Current page: ${context.pagePath ?? "unknown"}

Behavior:
- Answer from the provided Pronto context only.
- Cite relevant records by returning citedRecords with type, id, label, and href when available.
- If a user asks for a mutation, return an actionProposals item instead of pretending it is done.
- Never expose secrets, credentials, webhook tokens, API keys, password hashes, or auth/session values.
- Client users can only act on their own client. Operators can act across clients.
- Keep answers concise, operational, and specific.
- In client_owner mode, write like a business-owner briefing: customer impact, plain priorities, and owner actions.
- In operator mode, write like an ops console: triage, SLA, risk, cost, quality, and exact next steps.
- On conversation_detail intent, prioritize the current thread transcript, active escalation, review labels, reply drafts, and knowledge-update opportunities.

Allowed action types:
${assistantActionTypes.join(", ")}

Common payload shapes:
- escalation_claim: { "escalationId": "uuid" }
- escalation_resolve: { "escalationId": "uuid", "reply": "optional customer-facing reply" }
- escalation_retry_outbound: { "escalationId": "uuid", "outboundMessageId": "uuid" }
- knowledge_create: { "clientId": "uuid", "title": "text", "content": "text", "sourceType": "assistant_generated" }
- knowledge_update/delete: { "clientId": "uuid", "sourceId": "uuid", "title": "text", "content": "text" }
- knowledge_refresh_create: { "clientId": "uuid", "notes": "text", "cadence": "monthly" }
- knowledge_refresh_resolve: { "clientId": "uuid", "requestId": "uuid", "status": "completed|skipped", "notes": "text" }
- assistant_request_create: { "clientId": "uuid", "kind": "assistant_change|handoff_rule|tone|scope|other", "body": "text" }
- review_create: { "clientId": "uuid", "conversationId": "uuid", "answerLabel": "answered_correctly|should_have_escalated|over_escalated|hallucinated|needs_knowledge_update", "notes": "text" }
- channel_health_check: { "clientId": "uuid", "channelId": "uuid" }
- channel_update: { "clientId": "uuid", "channelId": "uuid", "status": "draft|active|disabled", "settings": {}, "credentials": {}, "externalId": "optional" }
- client_create: { "name": "text", "slug": "optional", "vertical": "general", "planTier": "pilot", "status": "draft", "brandVoice": "optional" }
- commercial_update: { "clientId": "uuid", "monthlyRetainerSgd": 1200, "setupFeeSgd": 2500, "amortizedSetupMonths": 6, "hostingCostSgd": 80, "integrationCostSgd": 150, "includedConversations": 500, "llmCostBufferMultiplier": 2 }
- agent_config_update: { "clientId": "uuid", "responseProvider": "openai", "responseModel": "model", "embeddingProvider": "openai", "embeddingModel": "model", "retrievalThreshold": 0.72, "promptPreamble": "text", "escalationRules": {}, "changeReason": "text" }
- brand_voice_update_document: { "clientId": "uuid", "title": "text", "content": "text", "attributes": {}, "sourceNotes": "text" }
- brand_voice_add_example: { "clientId": "uuid", "customerMessage": "text", "idealResponse": "text", "notes": "text" }
- brand_voice_toggle_example/delete_example: { "clientId": "uuid", "exampleId": "uuid", "isActive": true }
- offboarding_export: { "clientId": "uuid" }
- offboarding_delete: { "clientId": "uuid", "confirmSlug": "exact-client-slug" }

Return strict JSON only with:
answer: string
citedRecords: array of { type, id, label, href? }
followUpQuestions: string[]
actionProposals: array of { actionType, title, description, payload }
`.trim();
}

function buildAssistantUserInput(context: AssistantContext, message: string): string {
  return JSON.stringify(
    {
      userMessage: message,
      summary: context.summary,
      focusedRecords: context.focusedRecords,
      records: context.records,
    },
    null,
    2,
  );
}

async function generateWithOpenAi(input: {
  context: AssistantContext;
  message: string;
  model: string;
  requestId?: string;
}): Promise<AssistantGeneratedTurn> {
  const apiKey = await resolveProviderApiKey("openai");
  if (!apiKey) {
    throw new LlmConfigurationError(
      "openai",
      "OPENAI_API_KEY or a saved encrypted OpenAI credential is required.",
    );
  }
  const client = new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });
  const response = await client.responses.create({
    model: input.model,
    instructions: buildAssistantInstructions(input.context),
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: buildAssistantUserInput(input.context, input.message) }],
      },
    ],
    store: false,
    text: {
      format: {
        type: "json_schema",
        name: "pronto_assistant_turn",
        strict: false,
        schema: assistantTurnJsonSchema(),
      },
    },
  });
  return assistantGeneratedTurnSchema.parse(parseJsonObject(response.output_text));
}

async function generateWithAzure(input: {
  context: AssistantContext;
  message: string;
  model: string;
  requestId?: string;
}): Promise<AssistantGeneratedTurn> {
  const client = await getAzureOpenAiClient();
  if (!client) {
    throw new LlmConfigurationError(
      "azure",
      "AZURE_OPENAI_BASE_URL or AZURE_OPENAI_ENDPOINT and an Azure credential are required.",
    );
  }
  const response = await client.responses.create({
    model: input.model,
    instructions: buildAssistantInstructions(input.context),
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: buildAssistantUserInput(input.context, input.message) }],
      },
    ],
    store: false,
    text: {
      format: {
        type: "json_schema",
        name: "pronto_assistant_turn",
        strict: false,
        schema: assistantTurnJsonSchema(),
      },
    },
  });
  return assistantGeneratedTurnSchema.parse(parseJsonObject(response.output_text));
}

async function generateWithAnthropic(input: {
  context: AssistantContext;
  message: string;
  model: string;
}): Promise<AssistantGeneratedTurn> {
  const apiKey = await resolveProviderApiKey("anthropic");
  if (!apiKey) {
    throw new LlmConfigurationError(
      "anthropic",
      "ANTHROPIC_API_KEY or a saved encrypted Anthropic credential is required.",
    );
  }
  const response = await fetch(
    `${process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com"}/v1/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: input.model,
        max_tokens: 1200,
        system: buildAssistantInstructions(input.context),
        messages: [{ role: "user", content: buildAssistantUserInput(input.context, input.message) }],
      }),
    },
  );
  if (!response.ok) {
    const body = await response.text();
    logWarn("assistant.anthropic_failed", { status: response.status, error: body });
    throw new Error(`Anthropic assistant request failed: ${response.status}`);
  }
  const body = (await response.json()) as AnthropicMessageResponse;
  const text = body.content
    ?.filter((block) => block.type === "text" && block.text)
    .map((block) => block.text)
    .join("\n")
    .trim();
  if (!text) {
    throw new Error("Anthropic assistant response was empty.");
  }
  return assistantGeneratedTurnSchema.parse(parseJsonObject(text));
}

async function generateWithOpenAiCompatible(input: {
  context: AssistantContext;
  message: string;
  provider: string;
  model: string;
}): Promise<AssistantGeneratedTurn> {
  if (!isFreeLlmProviderId(input.provider)) {
    throw new LlmConfigurationError(input.provider, "Unsupported compatible provider.");
  }
  const provider = freeProviderById(input.provider);
  if (!provider) {
    throw new LlmConfigurationError(input.provider, "Compatible provider metadata is missing.");
  }
  const apiKey = await resolveProviderApiKey(provider.id);
  if (provider.requiresApiKey && !apiKey) {
    throw new LlmConfigurationError(
      provider.id,
      `${provider.name} requires an environment key or saved encrypted credential.`,
    );
  }
  const response = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0,
      messages: [
        { role: "system", content: buildAssistantInstructions(input.context) },
        { role: "user", content: buildAssistantUserInput(input.context, input.message) },
      ],
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    logWarn("assistant.compatible_failed", {
      provider: provider.id,
      status: response.status,
      error: body,
    });
    throw new Error(`${provider.name} assistant request failed: ${response.status}`);
  }
  const body = (await response.json()) as ChatCompletionResponse;
  const text = body.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error(`${provider.name} assistant response was empty.`);
  }
  return assistantGeneratedTurnSchema.parse(parseJsonObject(text));
}

function mockAssistantTurn(context: AssistantContext, message: string): AssistantGeneratedTurn {
  const lower = message.toLowerCase();
  const citedSource = context.focusedRecords.length ? context.focusedRecords : context.records;
  const citations = citedSource.slice(0, 5).map((record) => ({
    type: record.type,
    id: record.id,
    label: record.label,
    href: record.href,
  }));
  const proposals: AssistantActionDraft[] = [];
  const clientId = context.focusedClientId ?? context.user.clientId;
  const activeEscalation = context.records.find(
    (record) => record.type === "active_escalation",
  );
  const focusedConversation = context.focusedConversationId;

  if (clientId && lower.includes("knowledge refresh")) {
    proposals.push({
      actionType: "knowledge_refresh_create",
      title: "Create knowledge refresh",
      description: "Open a knowledge refresh request for the focused client.",
      payload: {
        clientId,
        cadence: "monthly",
        notes: message.slice(0, 500),
      },
    });
  }
  if (clientId && focusedConversation && lower.includes("review")) {
    proposals.push({
      actionType: "review_create",
      title: "Add conversation review",
      description: "Record a QA review label for this conversation.",
      payload: {
        clientId,
        conversationId: focusedConversation,
        answerLabel: lower.includes("knowledge")
          ? "needs_knowledge_update"
          : "answered_correctly",
        notes: message.slice(0, 500),
      },
    });
  }
  if (clientId && activeEscalation && lower.includes("resolve")) {
    proposals.push({
      actionType: "escalation_resolve",
      title: "Resolve escalation",
      description: "Resolve the active escalation after you review or edit the reply.",
      payload: {
        clientId,
        escalationId: activeEscalation.id,
        reply: draftReplyFromFocusedRecords(context),
      },
    });
  }
  if (clientId && focusedConversation && lower.includes("knowledge update")) {
    proposals.push({
      actionType: "knowledge_create",
      title: "Create knowledge update",
      description: "Add a source note based on this conversation gap.",
      payload: {
        clientId,
        title: "Conversation knowledge update",
        content: message.slice(0, 1000),
        sourceType: "assistant_generated",
      },
    });
  }
  if (clientId && lower.includes("assistant request")) {
    proposals.push({
      actionType: "assistant_request_create",
      title: "Create assistant change request",
      description: "Log this request for Pronto to review.",
      payload: {
        clientId,
        kind: "assistant_change",
        body: message.slice(0, 1000),
      },
    });
  }
  if (context.user.role === "operator" && lower.includes("create client")) {
    proposals.push({
      actionType: "client_create",
      title: "Create draft client",
      description: "Create a draft client shell. Edit the details before confirming if needed.",
      payload: {
        name: "New client",
        vertical: "general",
        planTier: "pilot",
        status: "draft",
      },
    });
  }

  logInfo("assistant.mock_generated", {
    userId: context.user.userId,
    role: context.user.role,
    focusedClientId: context.focusedClientId,
    proposalCount: proposals.length,
  });

  return {
    answer: [
      context.roleMode === "client_owner"
        ? "Here is the business-owner view."
        : "Here is the operator view.",
      context.summary[0] ?? "I can answer from the Pronto workspace context available to your role.",
      citations.length
        ? "I found relevant Pronto records and linked the most useful ones below."
        : "I did not find a directly relevant record in the compact context.",
    ].join(" "),
    citedRecords: citations,
    followUpQuestions: [
      "Do you want the highest-risk items first?",
      "Should I turn this into an action?",
    ],
    actionProposals: proposals,
  };
}

function draftReplyFromFocusedRecords(context: AssistantContext): string {
  const customerMessage = context.focusedRecords.find(
    (record) =>
      record.type === "focused_message" &&
      (record.data.senderRole === "customer" || record.data.sender_role === "customer"),
  );
  if (customerMessage && typeof customerMessage.data.body === "string") {
    return `Thanks for reaching out. We are checking this and will get back to you shortly.`;
  }
  return "Thanks for reaching out. We are checking this and will get back to you shortly.";
}

function assistantTurnJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      answer: { type: "string" },
      citedRecords: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            type: { type: "string" },
            id: { type: "string" },
            label: { type: "string" },
            href: { type: ["string", "null"] },
          },
          required: ["type", "id", "label", "href"],
        },
      },
      followUpQuestions: { type: "array", items: { type: "string" } },
      actionProposals: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            actionType: { type: "string", enum: [...assistantActionTypes] },
            title: { type: "string" },
            description: { type: "string" },
            payload: { type: "object", additionalProperties: true },
          },
          required: ["actionType", "title", "description", "payload"],
        },
      },
    },
    required: ["answer", "citedRecords", "followUpQuestions", "actionProposals"],
  };
}
