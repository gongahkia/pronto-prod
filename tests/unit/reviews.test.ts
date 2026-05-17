import { describe, expect, it } from "vitest";
import { answerLabels, optionalEnumValue } from "@/lib/reviews";

describe("review labels", () => {
  it("accepts only known answer labels", () => {
    expect(optionalEnumValue("over_escalated", answerLabels)).toBe("over_escalated");
    expect(optionalEnumValue("freeform", answerLabels)).toBeNull();
    expect(optionalEnumValue(null, answerLabels)).toBeNull();
  });
});
