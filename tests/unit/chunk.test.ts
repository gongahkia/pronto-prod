import { describe, expect, it } from "vitest";
import { chunkText, estimateTokens } from "@/lib/knowledge/chunk";

describe("knowledge chunking", () => {
  it("chunks paragraph groups under the configured size", () => {
    const chunks = chunkText(
      ["Opening hours are 10 to 10.", "Refunds must be escalated.", "Vegetarian tempeh is available."].join("\n\n"),
      { maxCharacters: 60, overlap: 10 },
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.content.length <= 60)).toBe(true);
  });

  it("estimates tokens conservatively", () => {
    expect(estimateTokens("12345678")).toBe(2);
  });
});

