import { z } from "zod";
import { logInfo, logWarn } from "@/lib/logger";
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
};

export class AnthropicProvider implements Pick<LlmProvider, "generateGroundedAnswer"> {
  async generateGroundedAnswer(
    input: GenerateAnswerInput,
  ): Promise<GroundedAnswerDecision> {
    if (process.env.PRONTO_USE_MOCK_AI === "1" || !process.env.ANTHROPIC_API_KEY) {
      logInfo("llm.generation.mocked", {
        requestId: input.requestId,
        clientId: input.clientId,
        conversationId: input.conversationId,
        provider: "anthropic",
        model: input.responseModel,
        reason:
          process.env.PRONTO_USE_MOCK_AI === "1"
            ? "mock_enabled"
            : "missing_api_key",
      });
      return mockGroundedAnswer(input);
    }

    let response: Response;
    try {
      response = await fetch(
        `${process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com"}/v1/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: input.responseModel,
            max_tokens: 800,
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

    const parsed = anthropicDecisionSchema.parse(parseJsonObject(text));
    if (parsed.action === "answer" && (!parsed.answer || !parsed.citedChunkIds.length)) {
      return {
        action: "escalate",
        answer: null,
        confidence: Math.min(parsed.confidence, 0.4),
        reasonCode: "ungrounded_answer",
        reasonDetail:
          "The model attempted to answer without a customer-facing answer or source citation.",
        citedChunkIds: parsed.citedChunkIds,
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

    return parsed;
  }
}
