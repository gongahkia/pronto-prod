import { describe, expect, it } from "vitest";
import { normalizeProviderName } from "@/lib/llm";
import { parseJsonObject } from "@/lib/llm/prompt";

describe("provider portability", () => {
  it("normalizes unknown providers back to OpenAI", () => {
    expect(normalizeProviderName("anthropic")).toBe("anthropic");
    expect(normalizeProviderName("mock")).toBe("mock");
    expect(normalizeProviderName("other")).toBe("openai");
    expect(normalizeProviderName(undefined)).toBe("openai");
  });

  it("extracts JSON from provider text responses", () => {
    expect(parseJsonObject('Here is the JSON: {"action":"escalate"}')).toEqual({
      action: "escalate",
    });
  });
});
