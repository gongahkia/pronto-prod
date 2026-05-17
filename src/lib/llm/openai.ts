import OpenAI from "openai";
import { z } from "zod";
import { shouldUseMockAi } from "@/lib/env";
import { mockEmbed, mockGroundedAnswer } from "@/lib/llm/mock";
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

const answerDecisionSchema = z.object({
  action: z.enum(["answer", "escalate"]),
  answer: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  reasonCode: z.string().min(1),
  reasonDetail: z.string().min(1),
  citedChunkIds: z.array(z.string()),
});

function getOpenAiClient(): OpenAI {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });
}

export class OpenAiProvider implements LlmProvider {
  async embed(texts: string[], model: string): Promise<number[][]> {
    if (shouldUseMockAi()) {
      return mockEmbed(texts);
    }

    const client = getOpenAiClient();
    const response = await client.embeddings.create({
      model,
      input: texts,
    });

    return response.data.map((item) => item.embedding);
  }

  async generateGroundedAnswer(
    input: GenerateAnswerInput,
  ): Promise<GroundedAnswerDecision> {
    if (shouldUseMockAi()) {
      return mockGroundedAnswer(input);
    }

    const client = getOpenAiClient();
    const response = await client.responses.create({
      model: input.responseModel,
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
    });

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
      };
    }

    return parsed;
  }
}
