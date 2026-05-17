import { z } from "zod";
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
      return mockGroundedAnswer(input);
    }

    const response = await fetch(
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

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Anthropic message failed: ${response.status} ${body}`);
    }

    const body = (await response.json()) as AnthropicMessageResponse;
    const text = body.content
      ?.filter((block) => block.type === "text" && block.text)
      .map((block) => block.text)
      .join("\n")
      .trim();
    if (!text) {
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

    return parsed;
  }
}
