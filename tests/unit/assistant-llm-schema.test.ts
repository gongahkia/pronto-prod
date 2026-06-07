import { describe, expect, it } from "vitest";
import { assistantGeneratedTurnSchema } from "@/lib/assistant/types";

describe("assistant generated turn schema", () => {
  it("normalizes null citation hrefs returned by Azure structured output", () => {
    const parsed = assistantGeneratedTurnSchema.parse({
      answer: "Review the active escalation first.",
      citedRecords: [
        {
          type: "active_escalation",
          id: "esc-1",
          label: "Refund complaint",
          href: null,
        },
      ],
      followUpQuestions: [],
      actionProposals: [],
    });

    expect(parsed.citedRecords[0]).toEqual({
      type: "active_escalation",
      id: "esc-1",
      label: "Refund complaint",
      href: undefined,
    });
  });
});
