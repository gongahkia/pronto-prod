import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  query: mocks.query,
  transaction: mocks.transaction,
  vectorLiteral: (embedding: number[]) => `[${embedding.join(",")}]`,
}));

vi.mock("@/lib/llm", () => ({
  getEmbeddingProvider: () => ({
    embed: vi.fn(async (values: string[]) => values.map(() => [0.1, 0.2, 0.3])),
  }),
}));

import { ingestKnowledgeSource } from "@/lib/knowledge/ingest";

describe("knowledge ingestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates version 1 for a newly ingested source", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [{ embedding_model: "text-embedding-3-small", embedding_provider: "mock" }],
    });

    const txQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "source-1" }] })
      .mockResolvedValue({ rows: [] });
    mocks.transaction.mockImplementationOnce(async (callback) =>
      callback({
        query: txQuery,
      }),
    );

    const result = await ingestKnowledgeSource({
      clientId: "client-1",
      title: "Menu",
      sourceType: "manual",
      content: "Kopi is SGD 2.20.",
      metadata: { entryMode: "manual" },
      actorUserId: "user-1",
    });

    expect(result).toEqual({ sourceId: "source-1", chunkCount: 1 });
    expect(txQuery.mock.calls[1][0]).toContain("insert into knowledge_source_versions");
    expect(txQuery.mock.calls[1][1]).toEqual([
      "source-1",
      "client-1",
      "Menu",
      "Kopi is SGD 2.20.",
      { entryMode: "manual" },
      "user-1",
    ]);
  });
});
