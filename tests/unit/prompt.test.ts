import { describe, expect, it } from "vitest";
import { buildGroundedAnswerInstructions } from "@/lib/llm/prompt";

describe("prompt construction", () => {
  it("includes extended brand voice and multilingual few-shot examples", () => {
    const prompt = buildGroundedAnswerInstructions({
      clientName: "North Bridge Nasi",
      brandVoice: "Warm and concise.",
      brandVoiceDocument: "Use light Singlish only when natural.",
      fewShotExamples: [
        {
          customerMessage: "星期日有开吗?",
          idealResponse: "星期日有开。营业时间是上午10点到晚上10点。",
        },
        {
          customerMessage: "Sabtu buka pukul berapa?",
          idealResponse: "Sabtu kami buka dari 10:00 pagi hingga 10:00 malam.",
        },
        {
          customerMessage: "Can make it less spicy?",
          idealResponse: "Can. You may request less spicy sambal.",
        },
      ],
      promptPreamble: "Answer only from sources.",
      customerMessage: "Are you open?",
      recentMessages: [],
      responseModel: "mock",
      retrievedChunks: [],
    });

    expect(prompt).toContain("Brand voice document:");
    expect(prompt).toContain("Use light Singlish");
    expect(prompt).toContain("星期日有开吗?");
    expect(prompt).toContain("Sabtu buka pukul berapa?");
    expect(prompt).toContain("Can. You may request less spicy sambal.");
  });
});
