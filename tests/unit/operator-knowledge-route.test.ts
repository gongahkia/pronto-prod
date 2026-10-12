import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  submitKnowledgeSource: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireUser: mocks.requireUser,
}));

vi.mock("@/lib/knowledge/submissions", () => ({
  submitKnowledgeSource: mocks.submitKnowledgeSource,
}));

vi.mock("@/lib/knowledge/parse-upload", () => ({
  parseKnowledgeUpload: vi.fn(),
}));
vi.mock("@/lib/knowledge/source-extract", () => ({
  extractTextSource: async (content: string) => ({ sourceType: "text", content, metadata: { extraction: "plain_text" } }),
  extractPdfSource: vi.fn(), extractUrlSource: vi.fn(),
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

  it("submits manual knowledge for review for the submitted client", async () => {
    const form = new FormData();
    form.set("clientId", "client-1");
    form.set("title", "Menu");
    form.set("content", "Nasi Lemak Bowl is SGD 12.80.");
    form.set("returnTo", "/operator/clients/client-1/knowledge");

    const response = await POST(
      new Request("http://localhost/api/operator/knowledge", {
        method: "POST",
        headers: {
          host: "localhost",
          origin: "http://localhost",
        },
        body: form,
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/operator/clients/client-1/knowledge",
    );
    expect(mocks.submitKnowledgeSource).toHaveBeenCalledWith({
      actor: expect.objectContaining({ userId: "operator-1" }),
      clientId: "client-1",
      title: "Menu",
      sourceType: "text",
      content: "Nasi Lemak Bowl is SGD 12.80.",
      description: "", sourceUrl: undefined, outletName: "",
      metadata: { extraction: "plain_text" },
    });
  });

  it("rejects operator knowledge ingestion without a client ID", async () => {
    const response = await POST(
      new Request("http://localhost/api/operator/knowledge", {
        method: "POST",
        headers: {
          host: "localhost",
          origin: "http://localhost",
        },
        body: new FormData(),
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.submitKnowledgeSource).not.toHaveBeenCalled();
  });
});
