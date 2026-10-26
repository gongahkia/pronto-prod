import { describe, expect, it } from "vitest";
import { conflictStatements, knowledgeLineDiff, safeSourceUrl } from "@/lib/knowledge/review-display";

describe("source review comparisons", () => {
  it("shows only recorded conflict statements and safe references", () => {
    expect(conflictStatements([{ cutoff: "17:30", sourceUrl: "https://example.com/outlet" }, { claim: "Last reservations at 18:00", sourceUrl: "javascript:alert(1)" }, {}, null])).toEqual([
      { statement: "Cutoff: 17:30", sourceUrl: "https://example.com/outlet" }, { statement: "Last reservations at 18:00", sourceUrl: null },
    ]);
    expect(conflictStatements(null)).toEqual([]);
    expect(safeSourceUrl("https://user:password@example.com")).toBeNull();
  });

  it("preserves unchanged lines and identifies additions and deletions with line numbers", () => {
    expect(knowledgeLineDiff("Menu\nOld opening time\nConcierge", "Menu\nNew opening time\nBookings accepted\nConcierge")).toEqual([
      { kind: "same", text: "Menu", before: 1, after: 1 }, { kind: "removed", text: "Old opening time", before: 2, after: null },
      { kind: "added", text: "New opening time", before: null, after: 2 }, { kind: "added", text: "Bookings accepted", before: null, after: 3 },
      { kind: "same", text: "Concierge", before: 3, after: 4 },
    ]);
  });

  it("represents new and archived sources without inventing a prior version", () => {
    expect(knowledgeLineDiff("", "New fact")).toEqual([{ kind: "added", text: "New fact", before: null, after: 1 }]);
    expect(knowledgeLineDiff("Old fact", "")).toEqual([{ kind: "removed", text: "Old fact", before: 1, after: null }]);
    expect(knowledgeLineDiff("Same\r\nText", "Same\nText").every(line => line.kind === "same")).toBe(true);
  });

  it("bounds work on large documents and preserves both complete versions", () => {
    const before = Array.from({ length: 600 }, (_, i) => `Before ${i}`).join("\n");
    const after = Array.from({ length: 600 }, (_, i) => `After ${i}`).join("\n");
    const lines = knowledgeLineDiff(before, after);
    expect(lines.filter(line => line.kind !== "added").map(line => line.text).join("\n")).toBe(before);
    expect(lines.filter(line => line.kind !== "removed").map(line => line.text).join("\n")).toBe(after);
  });
});
