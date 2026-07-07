import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  transaction: vi.fn(),
  getEmbeddingProvider: vi.fn(),
  embed: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  query: mocks.query,
  transaction: mocks.transaction,
  vectorLiteral: (embedding: number[]) => `[${embedding.join(",")}]`,
}));

vi.mock("@/lib/llm", () => ({
  getEmbeddingProvider: mocks.getEmbeddingProvider,
}));

import { ingestKnowledgeSource } from "@/lib/knowledge/ingest";

describe("knowledge ingestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.embed.mockImplementation(async (values: string[]) =>
      values.map(() => [0.1, 0.2, 0.3]),
    );
    mocks.getEmbeddingProvider.mockReturnValue({ embed: mocks.embed });
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

  it("uses the runtime Azure embedding override when present", async () => {
    vi.stubEnv("PRONTO_EMBEDDING_PROVIDER", "azure");
    vi.stubEnv("PRONTO_EMBEDDING_MODEL", "azure-embedding-deployment");
    mocks.query.mockResolvedValueOnce({
      rows: [{ embedding_model: "text-embedding-3-small", embedding_provider: "openai" }],
    });
    mocks.transaction.mockImplementationOnce(async (callback) =>
      callback({
        query: vi.fn().mockResolvedValueOnce({ rows: [{ id: "source-1" }] }).mockResolvedValue({ rows: [] }),
      }),
    );

    await ingestKnowledgeSource({
      clientId: "client-1",
      title: "Menu",
      sourceType: "manual",
      content: "Kopi is SGD 2.20.",
    });

    expect(mocks.getEmbeddingProvider).toHaveBeenCalledWith("azure");
    expect(mocks.embed).toHaveBeenCalledWith(["Kopi is SGD 2.20."], "azure-embedding-deployment");
  });
});
