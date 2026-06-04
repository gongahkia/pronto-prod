import { describe, expect, it } from "vitest";
import { normalizeKnowledgeSourceMetadata } from "@/lib/knowledge/metadata";

describe("knowledge source metadata", () => {
  it("normalizes website crawl warnings and diagnostics", () => {
    const result = normalizeKnowledgeSourceMetadata({
      entryMode: "website",
      url: "https://north.example",
      crawledPages: ["https://north.example", "https://north.example/menu"],
      crawlDepth: 1,
      maxPages: 5,
      warnings: ["robots.txt may disallow /menu."],
    });

    expect(result.warnings).toEqual(["robots.txt may disallow /menu."]);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        { label: "Entry mode", value: "website" },
        { label: "Website URL", value: "https://north.example" },
        { label: "Crawl depth", value: "1" },
        {
          label: "Crawled pages",
          value: "2: https://north.example, https://north.example/menu",
        },
      ]),
    );
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
