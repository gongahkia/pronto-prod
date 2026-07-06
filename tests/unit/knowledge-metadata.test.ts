import { describe, expect, it } from "vitest";
import { normalizeKnowledgeSourceMetadata } from "@/lib/knowledge/metadata";

describe("knowledge source metadata", () => {
  it("normalizes manual entry warnings and diagnostics", () => {
    const result = normalizeKnowledgeSourceMetadata({
      entryMode: "manual",
      warnings: ["Check seasonal hours."],
    });

    expect(result.warnings).toEqual(["Check seasonal hours."]);
    expect(result.diagnostics).toEqual([{ label: "Entry mode", value: "manual" }]);
  });

  it("normalizes upload parser metadata", () => {
    const result = normalizeKnowledgeSourceMetadata({
      filename: "menu.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      parser: "mammoth",
      sizeBytes: 2048,
      warnings: ["Unsupported image skipped."],
    });

    expect(result.warnings).toEqual(["Unsupported image skipped."]);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        { label: "Filename", value: "menu.docx" },
        { label: "Parser", value: "mammoth" },
        { label: "Size", value: "2.0 KB" },
      ]),
    );
  });
});
