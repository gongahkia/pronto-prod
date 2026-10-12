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

import { POST } from "@/app/api/client/knowledge/route";

describe("client knowledge route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects client users without a client assignment", async () => {
    mocks.requireUser.mockResolvedValueOnce({
      userId: "user-1",
      clientId: null,
      role: "client",
    });

    const response = await POST(formRequest(new FormData()));

    expect(response.status).toBe(400);
    expect(mocks.submitKnowledgeSource).not.toHaveBeenCalled();
  });

  it("submits pending knowledge for the authenticated client's account", async () => {
    mocks.requireUser.mockResolvedValueOnce({
      userId: "user-1",
      clientId: "client-actual",
      role: "client",
    });
    mocks.submitKnowledgeSource.mockResolvedValueOnce({ id: "source-1", revision: 1 });

    const form = new FormData();
    form.set("clientId", "client-forged");
    form.set("title", "Updated menu");
    form.set("content", "Kopi is SGD 2.20.");

    const response = await POST(formRequest(form));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/client/knowledge?submitted=1");
    expect(mocks.submitKnowledgeSource).toHaveBeenCalledWith({
      actor: expect.objectContaining({ userId: "user-1", clientId: "client-actual" }),
      clientId: "client-actual",
      title: "Updated menu",
      sourceType: "text",
      content: "Kopi is SGD 2.20.",
      description: "", sourceUrl: undefined, outletName: "",
      metadata: { extraction: "plain_text" },
    });
  });

});

function formRequest(form: FormData): Request {
  return new Request("http://localhost/api/client/knowledge", {
    method: "POST",
    headers: {
      host: "localhost",
      origin: "http://localhost",
    },
    body: form,
  });
}
