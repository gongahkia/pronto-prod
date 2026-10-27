import { z } from "zod";
import { shouldUseMockAi } from "@/lib/env";
import { logInfo, logWarn } from "@/lib/logger";
import { resolveProviderApiKey } from "@/lib/llm/credentials";
import { LlmConfigurationError } from "@/lib/llm/errors";
import { parseReservationExtraction } from "@/lib/llm/reservation-extraction";
import { mockGroundedAnswer } from "@/lib/llm/mock";
import {
  buildGroundedAnswerInstructions,
  buildGroundedAnswerUserInput,
  parseJsonObject,
} from "@/lib/llm/prompt";
import type {
  GenerateAnswerInput,
  GroundedAnswerDecision,
  LlmProvider,
} from "@/lib/llm/types";

const anthropicDecisionSchema = z.object({
  action: z.enum(["answer", "escalate"]),
  answer: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  reasonCode: z.string().min(1),
  reasonDetail: z.string().min(1),
  citedChunkIds: z.array(z.string()),
});

type AnthropicMessageResponse = {
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
};

export class AnthropicProvider implements Pick<LlmProvider, "generateGroundedAnswer"> {
  async generateGroundedAnswer(
    input: GenerateAnswerInput,
  ): Promise<GroundedAnswerDecision> {
    if (shouldUseMockAi()) {
      logInfo("llm.generation.mocked", {
        requestId: input.requestId,
        clientId: input.clientId,
        conversationId: input.conversationId,
        provider: "anthropic",
        model: input.responseModel,
        reason: "mock_enabled",
      });
      return mockGroundedAnswer(input);
    }

    const apiKey = await resolveProviderApiKey("anthropic");
    if (!apiKey) {
      throw new LlmConfigurationError(
        "anthropic",
        "ANTHROPIC_API_KEY is required.",
      );
    }

    let response: Response;
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), input.timeoutMs ?? 25_000);
    try {
      response = await fetch(
        `${process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com"}/v1/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          signal: input.signal ? AbortSignal.any([abort.signal, input.signal]) : abort.signal,
          body: JSON.stringify({
            model: input.responseModel,
            max_tokens: input.maxOutputTokens ?? 800,
            system: buildGroundedAnswerInstructions(input),
            messages: [
              {
                role: "user",
                content: buildGroundedAnswerUserInput(input),
              },
            ],
          }),
        },
      );
    } catch (error) {
      logWarn("llm.generation_failed", {
        requestId: input.requestId,
        clientId: input.clientId,
        conversationId: input.conversationId,
        provider: "anthropic",
        model: input.responseModel,
        error,
      });
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const body = await response.text();
      logWarn("llm.generation_failed", {
        requestId: input.requestId,
        clientId: input.clientId,
        conversationId: input.conversationId,
        provider: "anthropic",
        model: input.responseModel,
        status: response.status,
        error: body,
      });
      throw new Error(`Anthropic message failed: ${response.status} ${body}`);
    }

    const body = (await response.json()) as AnthropicMessageResponse;
    const text = body.content
      ?.filter((block) => block.type === "text" && block.text)
      .map((block) => block.text)
      .join("\n")
      .trim();
    if (!text) {
      logWarn("llm.generation_failed", {
        requestId: input.requestId,
        clientId: input.clientId,
        conversationId: input.conversationId,
        provider: "anthropic",
        model: input.responseModel,
        reason: "empty_text",
      });
      throw new Error("Anthropic response did not include text content.");
    }

    const parsed = anthropicDecisionSchema.parse(input.reservationExtraction ? parseReservationExtraction(text) : parseJsonObject(text));
    if (parsed.action === "answer" && (!parsed.answer || (!parsed.citedChunkIds.length && !input.conversationalTurn))) {
      return {
        action: "escalate",
        answer: null,
        confidence: Math.min(parsed.confidence, 0.4),
        reasonCode: "ungrounded_answer",
        reasonDetail:
          "The model attempted to answer without a customer-facing answer or source citation.",
        citedChunkIds: parsed.citedChunkIds,
        usage: tokenUsage(body.usage),
      };
    }

    logInfo("llm.generation_completed", {
      requestId: input.requestId,
      clientId: input.clientId,
      conversationId: input.conversationId,
      provider: "anthropic",
      model: input.responseModel,
      action: parsed.action,
      reasonCode: parsed.reasonCode,
      confidence: parsed.confidence,
      citedChunkCount: parsed.citedChunkIds.length,
    });

    return { ...parsed, usage: tokenUsage(body.usage) };
  }
}

function tokenUsage(
  usage: AnthropicMessageResponse["usage"],
): { inputTokens: number; outputTokens: number } | undefined {
  if (
    typeof usage?.input_tokens !== "number" ||
    typeof usage.output_tokens !== "number"
  ) {
    return undefined;
  }
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
  };
}
