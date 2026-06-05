import { z } from "zod";
import { logWarn, redactErrorMessage } from "@/lib/logger";
import { resolveProviderApiKey } from "@/lib/llm/credentials";
import { freeProviderById, type FreeLlmProviderId } from "@/lib/llm/free-providers";
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

const compatibleDecisionSchema = z.object({
  action: z.enum(["answer", "escalate"]),
  answer: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  reasonCode: z.string().min(1),
  reasonDetail: z.string().min(1),
  citedChunkIds: z.array(z.string()),
});

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

export class OpenAiCompatibleProvider implements LlmProvider {
  constructor(private readonly providerId: FreeLlmProviderId) {}

  async embed(): Promise<number[][]> {
    throw new Error(`${this.providerId} does not support embeddings in Pronto yet.`);
  }

  async generateGroundedAnswer(
    input: GenerateAnswerInput,
  ): Promise<GroundedAnswerDecision> {
    const provider = freeProviderById(this.providerId);
    if (!provider || !provider.openAiCompatible) {
      throw new Error(`${this.providerId} is not wired as an OpenAI-compatible provider.`);
    }

    const apiKey = await resolveProviderApiKey(provider.id);
    if (provider.requiresApiKey && !apiKey) {
      throw new Error(`${provider.name} API key is not configured.`);
    }

    const response = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: input.responseModel,
        temperature: 0,
        messages: [
          {
            role: "system",
            content: [
              buildGroundedAnswerInstructions(input),
              "Return only a JSON object matching this shape: {\"action\":\"answer|escalate\",\"answer\":string|null,\"confidence\":number,\"reasonCode\":string,\"reasonDetail\":string,\"citedChunkIds\":string[]}.",
            ].join("\n\n"),
          },
          {
            role: "user",
            content: buildGroundedAnswerUserInput(input),
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      logWarn("llm_provider.chat_completion_failed", {
        provider: provider.id,
        model: input.responseModel,
        status: response.status,
        error: body,
      });
      throw new Error(`${provider.name} chat completion failed: ${response.status}`);
    }

    const body = (await response.json()) as ChatCompletionResponse;
    const text = body.choices?.[0]?.message?.content?.trim();
    if (!text) {
      logWarn("llm_provider.empty_chat_completion", {
        provider: provider.id,
        model: input.responseModel,
      });
      throw new Error(`${provider.name} response did not include text content.`);
    }

    try {
      const parsed = compatibleDecisionSchema.parse(parseJsonObject(text));
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
    } catch (error) {
      logWarn("llm_provider.invalid_decision_json", {
        provider: provider.id,
        model: input.responseModel,
        error: redactErrorMessage(error),
      });
      throw error;
    }
  }
}
