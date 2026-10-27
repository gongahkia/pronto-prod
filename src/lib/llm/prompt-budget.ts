import { createHash } from "node:crypto";
import { estimateTokens } from "@/lib/knowledge/chunk";
import { buildGroundedAnswerInstructions, buildGroundedAnswerUserInput } from "@/lib/llm/prompt";
import type { GenerateAnswerInput } from "@/lib/llm/types";

export class PromptBudgetExceededError extends Error {
  constructor() { super("The current message and required instructions exceed the prompt budget."); this.name = "PromptBudgetExceededError"; }
}

export function prepareGenerationInput(input: GenerateAnswerInput) {
  const prepared: GenerateAnswerInput = { ...input,
    recentMessages: [...input.recentMessages], retrievedChunks: [...input.retrievedChunks],
    fewShotExamples: [...(input.fewShotExamples ?? [])],
  };
  const limit = input.maxPromptTokens ?? 6000;
  for (;;) {
    const instructions = buildGroundedAnswerInstructions(prepared);
    const userInput = buildGroundedAnswerUserInput(prepared);
    // Count the final serialized message envelope, not just RAG/history slices.
    // The reserve covers provider-specific JSON schema/framing. Counts remain
    // explicit estimates; provider-reported usage is retained independently.
    const serialized = JSON.stringify({ messages: [{ role: "system", content: instructions }, { role: "user", content: userInput }] });
    const tokenEstimate = estimateTokens(serialized) + 256;
    if (tokenEstimate <= limit) return { input: prepared, tokenEstimate,
      hash: createHash("sha256").update(serialized).digest("hex") };
    if (prepared.fewShotExamples!.length) { prepared.fewShotExamples!.pop(); continue; }
    if (prepared.retrievedChunks.length > 1) { prepared.retrievedChunks.pop(); continue; }
    if (prepared.recentMessages.length) { prepared.recentMessages.shift(); continue; }
    if ((prepared.brandVoiceDocument?.length ?? 0) > 400) { prepared.brandVoiceDocument = prepared.brandVoiceDocument!.slice(0, 400); continue; }
    // Keep the latest customer message, policy and at least one complete source.
    // A truncated XML source or a silently dropped tool result is not evidence.
    throw new PromptBudgetExceededError();
  }
}
