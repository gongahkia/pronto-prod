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

import {
  deleteKnowledgeSourceForClient,
  getKnowledgeSourceForClient,
  updateKnowledgeSourceForClient,
} from "@/lib/knowledge/manage";

describe("knowledge source management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.embed.mockImplementation(async (values: string[]) =>
      values.map(() => [0.1, 0.2, 0.3]),
    );
    mocks.getEmbeddingProvider.mockReturnValue({ embed: mocks.embed });
  });

  it("scopes source lookup by source and client", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ id: "source-1" }] });

    const source = await getKnowledgeSourceForClient("source-1", "client-1");

    expect(source).toEqual({ id: "source-1" });
    expect(mocks.query.mock.calls[0][1]).toEqual(["source-1", "client-1"]);
  });

  it("returns null when updating a missing source", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });

    const result = await updateKnowledgeSourceForClient({
      sourceId: "source-1",
      clientId: "client-1",
      title: "Menu",
      content: "Kopi is SGD 2.20.",
    });

    expect(result).toBeNull();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("creates a new version when updating an existing source", async () => {
    mocks.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "source-1",
            client_id: "client-1",
            title: "Old menu",
            content: "Old content",
            metadata: { seed: true },
            created_at: new Date("2026-01-01T00:00:00Z"),
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ embedding_model: "text-embedding-3-small", embedding_provider: "mock" }],
      });

    const txQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ max_version: "1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "source-1" }], rowCount: 1 })
      .mockResolvedValue({ rows: [] });
    mocks.transaction.mockImplementationOnce(async (callback) =>
      callback({
        query: txQuery,
      }),
    );

    const result = await updateKnowledgeSourceForClient({
      sourceId: "source-1",
      clientId: "client-1",
      title: "Menu",
      content: "Kopi is SGD 2.20.",
      actorUserId: "user-1",
    });

    expect(result).toEqual({ sourceId: "source-1", chunkCount: 1 });
    expect(txQuery.mock.calls[2][0]).toContain("insert into knowledge_source_versions");
    expect(txQuery.mock.calls[2][1]).toEqual([
      "source-1",
      "client-1",
      2,
      "Menu",
      "Kopi is SGD 2.20.",
      {
        seed: true,
        lastEditedBy: "user-1",
        lastEditedAt: expect.any(String),
      },
      "user-1",
    ]);
  });

  it("uses the runtime Azure embedding override when updating a source", async () => {
    vi.stubEnv("PRONTO_EMBEDDING_PROVIDER", "azure");
    vi.stubEnv("PRONTO_EMBEDDING_MODEL", "azure-embedding-deployment");
    mocks.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "source-1",
            client_id: "client-1",
            title: "Old menu",
            content: "Old content",
            metadata: {},
            created_at: new Date("2026-01-01T00:00:00Z"),
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ embedding_model: "text-embedding-3-small", embedding_provider: "openai" }],
      });
    mocks.transaction.mockImplementationOnce(async (callback) =>
      callback({
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [{ max_version: "1" }] })
          .mockResolvedValueOnce({ rows: [{ id: "source-1" }], rowCount: 1 })
          .mockResolvedValue({ rows: [] }),
      }),
    );

    await updateKnowledgeSourceForClient({
      sourceId: "source-1",
      clientId: "client-1",
      title: "Menu",
      content: "Kopi is SGD 2.20.",
    });

    expect(mocks.getEmbeddingProvider).toHaveBeenCalledWith("azure");
    expect(mocks.embed).toHaveBeenCalledWith(["Kopi is SGD 2.20."], "azure-embedding-deployment");
  });

  it("returns false when deleting a missing source", async () => {
    mocks.transaction.mockImplementationOnce(async (callback) =>
      callback({
        query: vi.fn().mockResolvedValueOnce({ rows: [] }),
      }),
    );

    const result = await deleteKnowledgeSourceForClient({
      sourceId: "source-1",
      clientId: "client-1",
    });

    expect(result).toBe(false);
  });
});
