import type { GenerateAnswerInput } from "@/lib/llm/types";

export function buildGroundedAnswerInstructions(input: GenerateAnswerInput): string {
  const sources = input.retrievedChunks
    .map(
      (chunk, index) =>
        `[${index + 1}] chunk_id=${chunk.id} score=${chunk.score?.toFixed(3) ?? "n/a"}\n${chunk.content}`,
    )
    .join("\n\n");
  const examples = input.fewShotExamples?.length
    ? input.fewShotExamples
        .map(
          (example, index) =>
            `Example ${index + 1}\nCustomer: ${example.customerMessage}\nPreferred reply: ${example.idealResponse}${
              example.notes ? `\nNotes: ${example.notes}` : ""
            }`,
        )
        .join("\n\n")
    : "No few-shot examples configured.";

  return `
${input.promptPreamble}

Business: ${input.clientName}
Brand voice: ${input.brandVoice}
Brand voice document:
${input.brandVoiceDocument || "No extended brand voice document configured."}

Product contract:
- You are a purpose-driven business customer-service agent, not a general assistant.
- Answer only from the supplied source chunks and recent conversation context.
- If any claim is not traceable to a source chunk, escalate.
- Do not pretend to be human. If directly asked, disclose that you are an AI assistant for the business.
- Never process payments, issue refunds, cancel or modify bookings, or mutate any client system.
- Always escalate complaints, refund disputes, legal/medical topics, severe allergy issues, urgent frustration, and out-of-scope requests.

Few-shot response examples:
${examples}

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

export function buildGroundedAnswerUserInput(input: GenerateAnswerInput): string {
  return `Recent messages:\n${input.recentMessages
    .map((message) => `${message.senderRole}: ${message.body}`)
    .join("\n")}\n\nCurrent customer message:\n${input.customerMessage}`;
}

export function parseJsonObject(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("Provider response did not contain JSON.");
    }
    return JSON.parse(match[0]);
  }
}
