import OpenAI from "openai";
import { z } from "zod";
import { shouldUseMockAi } from "@/lib/env";
import { logInfo, logWarn } from "@/lib/logger";
import { resolveProviderApiKey } from "@/lib/llm/credentials";
import { LlmConfigurationError } from "@/lib/llm/errors";
import { parseReservationExtraction, reservationExtractionJsonSchema } from "@/lib/llm/reservation-extraction";
import { mockEmbed, mockGroundedAnswer } from "@/lib/llm/mock";
import {
  buildGroundedAnswerInstructions,
  buildGroundedAnswerUserInput,
  parseJsonObject,
} from "@/lib/llm/prompt";
import type {
  GenerateAnswerInput,
  GroundedAnswerDecision,
  LlmCallContext,
  LlmProvider,
} from "@/lib/llm/types";

const answerDecisionSchema = z.object({
  action: z.enum(["answer", "escalate"]),
  answer: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  reasonCode: z.string().min(1),
  reasonDetail: z.string().min(1),
  citedChunkIds: z.array(z.string()),
});

type OpenAiProviderName = "openai" | "azure";
type ReasoningEffort = "minimal" | "low" | "medium" | "high";

type OpenAiProviderOptions = {
  provider?: OpenAiProviderName;
  baseURL?: () => string | undefined;
  responseModel?: (model: string) => string;
  embeddingModel?: (model: string) => string;
  reasoningEffort?: () => ReasoningEffort | undefined;
};

export class OpenAiProvider implements LlmProvider {
  private readonly provider: OpenAiProviderName;
  private readonly baseURL: () => string | undefined;
  private readonly responseModel: (model: string) => string;
  private readonly embeddingModel: (model: string) => string;
  private readonly reasoningEffort: () => ReasoningEffort | undefined;

  constructor(options: OpenAiProviderOptions = {}) {
    this.provider = options.provider ?? "openai";
    this.baseURL = options.baseURL ?? (() => process.env.OPENAI_BASE_URL || undefined);
    this.responseModel = options.responseModel ?? ((model) => model);
    this.embeddingModel = options.embeddingModel ?? ((model) => model);
    this.reasoningEffort = options.reasoningEffort ?? (() => undefined);
  }

  async embed(
    texts: string[],
    model: string,
    context: LlmCallContext = {},
  ): Promise<number[][]> {
    const resolvedModel = this.embeddingModel(model);
    if (shouldUseMockAi()) {
      logInfo("llm.embedding.mocked", {
        ...context,
        provider: this.provider,
        model: resolvedModel,
        inputCount: texts.length,
        reason: "mock_enabled",
      });
      return mockEmbed(texts);
    }

    const client = await this.client();
    if (!client) {
      throw new LlmConfigurationError(
        this.provider,
        `${apiKeyEnvName(this.provider)} is required.`,
      );
    }

    try {
      const response = await client.embeddings.create({
        model: resolvedModel,
        input: texts,
      });
      logInfo("llm.embedding.completed", {
        ...context,
        provider: this.provider,
        model: resolvedModel,
        inputCount: texts.length,
        embeddingCount: response.data.length,
      });

      return response.data.map((item) => item.embedding);
    } catch (error) {
      logWarn("llm.embedding_failed", {
        ...context,
        provider: this.provider,
        model: resolvedModel,
        inputCount: texts.length,
        error,
      });
      throw error;
    }
  }

  async generateGroundedAnswer(
    input: GenerateAnswerInput,
  ): Promise<GroundedAnswerDecision> {
    const model = this.responseModel(input.responseModel);
    if (shouldUseMockAi()) {
      logInfo("llm.generation.mocked", {
        requestId: input.requestId,
        clientId: input.clientId,
        conversationId: input.conversationId,
        provider: this.provider,
        model,
        reason: "mock_enabled",
      });
      return mockGroundedAnswer(input);
    }

    const client = await this.client();
    if (!client) {
      throw new LlmConfigurationError(
        this.provider,
        `${apiKeyEnvName(this.provider)} is required.`,
      );
    }

    let response: {
      output_text?: string;
      output?: unknown[];
      usage?: { input_tokens: number; output_tokens: number };
    };
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), input.timeoutMs ?? 25_000);
    try {
      const reasoningEffort = this.reasoningEffort();
      response = await client.responses.create({
        model,
        max_output_tokens: input.maxOutputTokens,
        instructions: buildGroundedAnswerInstructions(input),
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: buildGroundedAnswerUserInput(input),
              },
            ],
          },
        ],
        store: false,
        ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
        text: {
          format: {
            type: "json_schema",
            name: "pronto_agent_decision",
            strict: true,
            schema: input.reservationExtraction ? reservationExtractionJsonSchema : {
              type: "object",
              additionalProperties: false,
              properties: {
                action: { type: "string", enum: ["answer", "escalate"] },
                answer: { type: ["string", "null"] },
                confidence: { type: "number", minimum: 0, maximum: 1 },
                reasonCode: { type: "string" },
                reasonDetail: { type: "string" },
                citedChunkIds: { type: "array", items: { type: "string" } },
              },
              required: [
                "action",
                "answer",
                "confidence",
                "reasonCode",
                "reasonDetail",
                "citedChunkIds",
              ],
            },
          },
        },
      }, { signal: abort.signal });
    } catch (error) {
      logWarn("llm.generation_failed", {
        requestId: input.requestId,
        clientId: input.clientId,
        conversationId: input.conversationId,
        provider: this.provider,
        model,
        error,
      });
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    const parsedJson = input.reservationExtraction ? parseReservationExtraction(responseOutputText(response)) : parseJsonObject(responseOutputText(response));
    const parsed = answerDecisionSchema.parse(parsedJson);

    if (parsed.action === "answer" && (!parsed.answer || (!parsed.citedChunkIds.length && !input.conversationalTurn))) {
      return {
        action: "escalate",
        answer: null,
        confidence: Math.min(parsed.confidence, 0.4),
        reasonCode: "ungrounded_answer",
        reasonDetail:
          "The model attempted to answer without a customer-facing answer or source citation.",
        citedChunkIds: parsed.citedChunkIds,
        usage: tokenUsage(response.usage),
      };
    }

    logInfo("llm.generation_completed", {
      requestId: input.requestId,
      clientId: input.clientId,
      conversationId: input.conversationId,
      provider: this.provider,
      model,
      action: parsed.action,
      reasonCode: parsed.reasonCode,
      confidence: parsed.confidence,
      citedChunkCount: parsed.citedChunkIds.length,
    });

    return { ...parsed, usage: tokenUsage(response.usage) };
  }

  private async client(): Promise<OpenAI | null> {
    const apiKey = await resolveProviderApiKey(this.provider);
    if (!apiKey) {
      return null;
    }
    return new OpenAI({
      apiKey,
      baseURL: this.baseURL(),
    });
  }
}

function tokenUsage(
  usage: { input_tokens: number; output_tokens: number } | undefined,
): { inputTokens: number; outputTokens: number } | undefined {
  if (!usage) return undefined;
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
  };
}

function apiKeyEnvName(provider: OpenAiProviderName): string {
  return provider === "azure" ? "AZURE_OPENAI_API_KEY" : "OPENAI_API_KEY";
}

function responseOutputText(response: { output_text?: string; output?: unknown[] }): string {
  if (typeof response.output_text === "string") {
    return response.output_text;
  }
  const parts: string[] = [];
  for (const item of response.output ?? []) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const entry of content) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const text = (entry as { text?: unknown }).text;
      if (typeof text === "string") {
        parts.push(text);
      }
    }
  }
  return parts.join("");
}
