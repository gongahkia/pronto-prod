import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  query: vi.fn(),
  vectorLiteral: (values: readonly number[]) =>
    `[${values.map((value) => value.toFixed(2)).join(",")}]`,
}));

vi.mock("@/lib/logger", () => ({
  logInfo: vi.fn(),
}));

import { query } from "@/lib/db";
import { retrieveKnowledge } from "@/lib/knowledge/retrieve";

const mockedQuery = vi.mocked(query);

describe("retrieveKnowledge", () => {
  beforeEach(() => {
    mockedQuery.mockReset();
  });

  it("uses vector retrieval when no normalized query text is provided", async () => {
    mockedQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "chunk-1",
          source_id: "source-1",
          client_id: "client-1",
          chunk_index: 0,
          content: "Opening hours are 11 AM to 9:30 PM.",
          token_estimate: 12,
          metadata: {},
          distance: "0.2",
        },
      ],
    } as never);

    const chunks = await retrieveKnowledge("client-1", [0.1, 0.2], 3);

    expect(mockedQuery).toHaveBeenCalledTimes(1);
    expect(String(mockedQuery.mock.calls[0][0])).not.toContain(
      "websearch_to_tsquery",
    );
    expect(mockedQuery.mock.calls[0][1]).toEqual(["client-1", "[0.10,0.20]", 3]);
    expect(chunks[0].score).toBeCloseTo(0.8);
  });

  it("combines vector and keyword candidates when query text is provided", async () => {
    mockedQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "chunk-1",
          source_id: "source-1",
          client_id: "client-1",
          chunk_index: 0,
          content: "Opening hours are 11 AM to 9:30 PM.",
          token_estimate: 12,
          metadata: {},
          distance: "0.35",
          vector_score: "0.65",
          keyword_rank: "0.12",
          combined_score: "1.40",
        },
      ],
    } as never);

    const chunks = await retrieveKnowledge("client-1", [0.1, 0.2], 3, {
      queryText: "opening OR hours OR sunday",
    });

    expect(mockedQuery).toHaveBeenCalledTimes(1);
    expect(String(mockedQuery.mock.calls[0][0])).toContain(
      "websearch_to_tsquery",
    );
    expect(mockedQuery.mock.calls[0][1]).toEqual([
      "client-1",
      "[0.10,0.20]",
      "opening OR hours OR sunday",
      20,
      3,
    ]);
    expect(chunks[0].score).toBeCloseTo(1);
  });
});
