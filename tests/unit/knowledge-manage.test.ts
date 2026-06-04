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

import {
  deleteKnowledgeSourceForClient,
  getKnowledgeSourceForClient,
  updateKnowledgeSourceForClient,
} from "@/lib/knowledge/manage";

describe("knowledge source management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
