import OpenAI from "openai";
import { z } from "zod";
import { shouldUseMockAi } from "@/lib/env";
import { mockEmbed, mockGroundedAnswer } from "@/lib/llm/mock";
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

function buildInstructions(input: GenerateAnswerInput): string {
  const sources = input.retrievedChunks
    .map(
      (chunk, index) =>
        `[${index + 1}] chunk_id=${chunk.id} score=${chunk.score?.toFixed(3) ?? "n/a"}\n${chunk.content}`,
    )
    .join("\n\n");

  return `
${input.promptPreamble}

Business: ${input.clientName}
Brand voice: ${input.brandVoice}

Product contract:
- You are a purpose-driven business customer-service agent, not a general assistant.
- Answer only from the supplied source chunks and recent conversation context.
- If any claim is not traceable to a source chunk, escalate.
- Do not pretend to be human. If directly asked, disclose that you are an AI assistant for the business.
- Never process payments, issue refunds, cancel or modify bookings, or mutate any client system.
- Always escalate complaints, refund disputes, legal/medical topics, severe allergy issues, urgent frustration, and out-of-scope requests.

Return strict JSON only with:
action: "answer" or "escalate"
answer: customer-facing answer or null
confidence: 0 to 1
reasonCode: snake_case reason
reasonDetail: concise internal explanation
citedChunkIds: source chunk IDs used

Sources:
${sources || "No source chunks returned."}
`.trim();
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
      instructions: buildInstructions(input),
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Recent messages:\n${input.recentMessages
                .map((message) => `${message.senderRole}: ${message.body}`)
                .join("\n")}\n\nCurrent customer message:\n${input.customerMessage}`,
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

    const parsedJson = JSON.parse(response.output_text);
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

export const llmProvider = new OpenAiProvider();
