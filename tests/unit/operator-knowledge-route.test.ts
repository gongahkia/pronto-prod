import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  ingestKnowledgeSource: vi.fn(),
  crawlWebsiteKnowledge: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireUser: mocks.requireUser,
}));

vi.mock("@/lib/knowledge/ingest", () => ({
  ingestKnowledgeSource: mocks.ingestKnowledgeSource,
}));

vi.mock("@/lib/knowledge/parse-upload", () => ({
  parseKnowledgeUpload: vi.fn(),
}));

vi.mock("@/lib/knowledge/website", () => ({
  crawlWebsiteKnowledge: mocks.crawlWebsiteKnowledge,
}));

import { POST } from "@/app/api/operator/knowledge/route";

describe("operator knowledge route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({
      userId: "operator-1",
      clientId: null,
      role: "operator",
    });
  });

  it("ingests crawled website knowledge for the submitted client", async () => {
    mocks.crawlWebsiteKnowledge.mockResolvedValueOnce({
      title: "North Bridge Nasi",
      content: "Nasi Lemak Bowl is SGD 12.80.",
      metadata: {
        entryMode: "website",
        url: "https://north.example/",
        crawledPages: ["https://north.example/"],
        crawlDepth: 1,
        maxPages: 5,
        warnings: [],
      },
    });

    const form = new FormData();
    form.set("clientId", "client-1");
    form.set("url", "https://north.example/");
    form.set("returnTo", "/operator/clients/client-1/knowledge");

    const response = await POST(
      new Request("http://localhost/api/operator/knowledge", {
        method: "POST",
        body: form,
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/operator/clients/client-1/knowledge",
    );
    expect(mocks.ingestKnowledgeSource).toHaveBeenCalledWith({
      clientId: "client-1",
      title: "North Bridge Nasi",
      sourceType: "website",
      content: "Nasi Lemak Bowl is SGD 12.80.",
      metadata: {
        entryMode: "website",
        url: "https://north.example/",
        crawledPages: ["https://north.example/"],
        crawlDepth: 1,
        maxPages: 5,
        warnings: [],
      },
      actorUserId: "operator-1",
    });
  });

  it("rejects operator knowledge ingestion without a client ID", async () => {
    const response = await POST(
      new Request("http://localhost/api/operator/knowledge", {
        method: "POST",
        body: new FormData(),
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.ingestKnowledgeSource).not.toHaveBeenCalled();
  });
});
