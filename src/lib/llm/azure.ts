import OpenAI from "openai";
import { z } from "zod";
import { shouldUseMockAi } from "@/lib/env";
import { logInfo, logWarn } from "@/lib/logger";
import { resolveProviderApiKey } from "@/lib/llm/credentials";
import { LlmConfigurationError } from "@/lib/llm/errors";
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

const azureDecisionSchema = z.object({
  action: z.enum(["answer", "escalate"]),
  answer: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  reasonCode: z.string().min(1),
  reasonDetail: z.string().min(1),
  citedChunkIds: z.array(z.string()),
});

export function azureOpenAiBaseUrl(): string | null {
  const explicit = process.env.AZURE_OPENAI_BASE_URL?.trim();
  if (explicit) {
    return ensureTrailingSlash(explicit);
  }

  const endpoint = process.env.AZURE_OPENAI_ENDPOINT?.trim();
  if (!endpoint) {
    return null;
  }
  if (endpoint.includes("/openai/")) {
    return ensureTrailingSlash(endpoint);
  }
  return `${endpoint.replace(/\/+$/, "")}/openai/v1/`;
}

export function azureOpenAiResponseModel(): string | undefined {
  return (
    process.env.AZURE_OPENAI_RESPONSE_MODEL?.trim() ||
    process.env.AZURE_OPENAI_DEPLOYMENT?.trim() ||
    undefined
  );
}

export function azureOpenAiEmbeddingModel(): string | undefined {
  return (
    process.env.AZURE_OPENAI_EMBEDDING_MODEL?.trim() ||
    process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT?.trim() ||
    undefined
  );
}

export async function getAzureOpenAiClient(): Promise<OpenAI | null> {
  const apiKey = await resolveProviderApiKey("azure");
  const baseURL = azureOpenAiBaseUrl();
  if (!apiKey || !baseURL) {
    return null;
  }
  return new OpenAI({ apiKey, baseURL });
}

export class AzureOpenAiProvider implements LlmProvider {
  async embed(
    texts: string[],
    model: string,
    context: LlmCallContext = {},
  ): Promise<number[][]> {
    if (shouldUseMockAi()) {
      logInfo("llm.embedding.mocked", {
        ...context,
        provider: "azure",
        model,
        inputCount: texts.length,
        reason: "mock_enabled",
      });
      return mockEmbed(texts);
    }

    const client = await getAzureOpenAiClient();
    if (!client) {
      throw new LlmConfigurationError("azure", azureConfigurationDetail());
    }

    try {
      const response = await client.embeddings.create({
        model,
        input: texts,
      });
      logInfo("llm.embedding.completed", {
        ...context,
        provider: "azure",
        model,
        inputCount: texts.length,
        embeddingCount: response.data.length,
      });

      return response.data.map((item) => item.embedding);
    } catch (error) {
      logWarn("llm.embedding_failed", {
        ...context,
        provider: "azure",
        model,
        inputCount: texts.length,
        error,
      });
      throw error;
    }
  }

  async generateGroundedAnswer(
    input: GenerateAnswerInput,
  ): Promise<GroundedAnswerDecision> {
    if (shouldUseMockAi()) {
      logInfo("llm.generation.mocked", {
        requestId: input.requestId,
        clientId: input.clientId,
        conversationId: input.conversationId,
        provider: "azure",
        model: input.responseModel,
        reason: "mock_enabled",
      });
      return mockGroundedAnswer(input);
    }

    const client = await getAzureOpenAiClient();
    if (!client) {
      throw new LlmConfigurationError("azure", azureConfigurationDetail());
    }

    let response: {
      output_text: string;
      usage?: { input_tokens: number; output_tokens: number };
    };
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), input.timeoutMs ?? 25_000);
    try {
      response = await client.responses.create({
        model: input.responseModel,
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
        text: {
          format: {
            type: "json_schema",
            name: "pronto_agent_decision",
            strict: true,
            schema: {
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
        provider: "azure",
        model: input.responseModel,
        error,
      });
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    const parsedJson = parseJsonObject(response.output_text);
    const parsed = azureDecisionSchema.parse(parsedJson);

    if (parsed.action === "answer" && (!parsed.answer || !parsed.citedChunkIds.length)) {
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
      provider: "azure",
      model: input.responseModel,
      action: parsed.action,
      reasonCode: parsed.reasonCode,
      confidence: parsed.confidence,
      citedChunkCount: parsed.citedChunkIds.length,
    });

    return { ...parsed, usage: tokenUsage(response.usage) };
  }
}

function ensureTrailingSlash(value: string): string {
  return `${value.replace(/\/+$/, "")}/`;
}

function azureConfigurationDetail(): string {
  if (!azureOpenAiBaseUrl()) {
    return "AZURE_OPENAI_BASE_URL or AZURE_OPENAI_ENDPOINT is required.";
  }
  return "AZURE_OPENAI_API_KEY or a saved encrypted Azure OpenAI credential is required.";
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
