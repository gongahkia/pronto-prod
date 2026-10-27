import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareGenerationInput, PromptBudgetExceededError } from "@/lib/llm/prompt-budget";
import { buildGroundedAnswerInstructions } from "@/lib/llm/prompt";
import { getGenerationProvider } from "@/lib/llm";
import { FreeTierProvider } from "@/lib/llm/free-providers";
import { withAiExecutionProfile } from "@/lib/llm/execution-mode";
import type { GenerateAnswerInput } from "@/lib/llm/types";

const input: GenerateAnswerInput = { clientName: "Synthetic restaurant", brandVoice: "Be concise.", promptPreamble: "Use approved facts.",
  customerMessage: "When do you close?", recentMessages: [], responseModel: "openai/gpt-oss-20b", maxPromptTokens: 3000,
  retrievedChunks: [{ id: "hours", source_id: "hours", client_id: "tenant", chunk_index: 0,
    content: "We close at 10pm.", token_estimate: 10, metadata: {} }] };
afterEach(() => vi.restoreAllMocks());

describe("complete serialized prompt budgets", () => {
  it("includes fixed instructions, current message and framing in the total", () => {
    const packed = prepareGenerationInput(input);
    expect(packed.tokenEstimate).toBeLessThanOrEqual(3000);
    expect(packed.tokenEstimate).toBeGreaterThan(256);
    expect(packed.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(prepareGenerationInput(input).hash).toBe(packed.hash);
    expect(packed.input.customerMessage).toBe(input.customerMessage);
  });
  it("drops lower-priority material as whole records, preserving the top source and latest request", () => {
    const big = { ...input.retrievedChunks[0], id: "large", content: "Unneeded lower-ranked material. ".repeat(5000) };
    const expanded = { ...input, retrievedChunks: [...input.retrievedChunks, big],
      recentMessages: [{ senderRole: "customer", body: "Old history ".repeat(5000) }],
      fewShotExamples: [{ customerMessage: "Old style", idealResponse: "Example ".repeat(5000) }] };
    const packed = prepareGenerationInput(expanded);
    expect(packed.input.retrievedChunks.map(chunk => chunk.id)).toEqual(["hours"]);
    expect(packed.input.recentMessages).toEqual([]);
    expect(packed.input.customerMessage).toBe(input.customerMessage);
    const prompt = buildGroundedAnswerInstructions(packed.input);
    expect(prompt).toContain("We close at 10pm.\n</source_chunk>");
    expect(prompt).not.toContain("[truncated]");
    expect(expanded.retrievedChunks).toHaveLength(2);
  });
  it("rejects an oversized latest message before touching a model", async () => {
    const generate = vi.spyOn(FreeTierProvider.prototype, "generateGroundedAnswer");
    await expect(withAiExecutionProfile({ mode: "real" }, () => getGenerationProvider("groq").generateGroundedAnswer({
      ...input, customerMessage: "Latest request ".repeat(5000),
    }))).rejects.toBeInstanceOf(PromptBudgetExceededError);
    expect(generate).not.toHaveBeenCalled();
  });
  it("retains the exact packed evidence IDs and prompt fingerprint on a decision", async () => {
    vi.spyOn(FreeTierProvider.prototype, "generateGroundedAnswer").mockResolvedValue({ action: "answer", answer: "We close at 10pm.",
      citedChunkIds: ["hours"], confidence: 1, reasonCode: "grounded", reasonDetail: "Fixture" });
    const result = await withAiExecutionProfile({ mode: "real" }, () => getGenerationProvider("groq").generateGroundedAnswer(input));
    expect(result.contextChunkIds).toEqual(["hours"]);
    expect(result.promptHash).toBe(prepareGenerationInput(input).hash);
  });
});
