import { describe, expect, it } from "vitest";
import { parseCsv, parseKnowledgeUpload } from "@/lib/knowledge/parse-upload";

describe("knowledge upload parsing", () => {
  it("parses TXT uploads", async () => {
    const file = new File(["Opening hours:\nMonday 9-5"], "hours.txt", {
      type: "text/plain",
    });

    const parsed = await parseKnowledgeUpload(file);

    expect(parsed).toMatchObject({
      title: "hours",
      sourceType: "upload_txt",
      content: "Opening hours:\nMonday 9-5",
    });
  });

  it("maps CSV rows into labeled knowledge text", async () => {
    const file = new File(
      ['Item,Price,Notes\n"Signature Bowl",12.80,"Includes sambal, egg"\nKopi,2.20,Hot drink'],
      "menu.csv",
      { type: "text/csv" },
    );

    const parsed = await parseKnowledgeUpload(file);

    expect(parsed.sourceType).toBe("upload_csv");
    expect(parsed.content).toContain("Item: Signature Bowl; Price: 12.80");
    expect(parsed.content).toContain("Notes: Includes sambal, egg");
  });

  it("handles quoted CSV fields", () => {
    expect(parseCsv('Name,Notes\n"Foo, Bar","Line ""quoted"""')).toEqual([
      ["Name", "Notes"],
      ["Foo, Bar", 'Line "quoted"'],
    ]);
  });
});
