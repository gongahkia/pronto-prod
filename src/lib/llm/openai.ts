import OpenAI from "openai";
import { z } from "zod";
import { shouldUseMockAi } from "@/lib/env";
import { logInfo, logWarn } from "@/lib/logger";
import { resolveProviderApiKey } from "@/lib/llm/credentials";
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

async function getOpenAiClient(): Promise<OpenAI | null> {
  const apiKey = await resolveProviderApiKey("openai");
  if (!apiKey) {
    return null;
  }
  return new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });
}

export class OpenAiProvider implements LlmProvider {
  async embed(
    texts: string[],
    model: string,
    context: LlmCallContext = {},
  ): Promise<number[][]> {
    if (shouldUseMockAi()) {
      logInfo("llm.embedding.mocked", {
        ...context,
        provider: "openai",
        model,
        inputCount: texts.length,
        reason: "mock_enabled",
      });
      return mockEmbed(texts);
    }

    const client = await getOpenAiClient();
    if (!client) {
      logInfo("llm.embedding.mocked", {
        ...context,
        provider: "openai",
        model,
        inputCount: texts.length,
        reason: "missing_api_key",
      });
      return mockEmbed(texts);
    }

    try {
      const response = await client.embeddings.create({
        model,
        input: texts,
      });
      logInfo("llm.embedding.completed", {
        ...context,
        provider: "openai",
        model,
        inputCount: texts.length,
        embeddingCount: response.data.length,
      });

      return response.data.map((item) => item.embedding);
    } catch (error) {
      logWarn("llm.embedding_failed", {
        ...context,
        provider: "openai",
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
        provider: "openai",
        model: input.responseModel,
        reason: "mock_enabled",
      });
      return mockGroundedAnswer(input);
    }

    const client = await getOpenAiClient();
    if (!client) {
      logInfo("llm.generation.mocked", {
        requestId: input.requestId,
        clientId: input.clientId,
        conversationId: input.conversationId,
        provider: "openai",
        model: input.responseModel,
        reason: "missing_api_key",
      });
      return mockGroundedAnswer(input);
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
        provider: "openai",
        model: input.responseModel,
        error,
      });
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    const parsedJson = parseJsonObject(response.output_text);
    const parsed = answerDecisionSchema.parse(parsedJson);

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
      provider: "openai",
      model: input.responseModel,
      action: parsed.action,
      reasonCode: parsed.reasonCode,
      confidence: parsed.confidence,
      citedChunkCount: parsed.citedChunkIds.length,
    });

    return { ...parsed, usage: tokenUsage(response.usage) };
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
