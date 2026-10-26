// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  submitKnowledgeSource: vi.fn(),
  recordSourceExtractionFailure: vi.fn(), extractFileSource: vi.fn(), extractHtmlSource: vi.fn(), extractUrlSource: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireUser: mocks.requireUser,
}));

vi.mock("@/lib/knowledge/submissions", () => ({
  submitKnowledgeSource: mocks.submitKnowledgeSource,
  recordSourceExtractionFailure: mocks.recordSourceExtractionFailure,
}));

vi.mock("@/lib/knowledge/parse-upload", () => ({
  parseKnowledgeUpload: vi.fn(),
}));
vi.mock("@/lib/knowledge/source-extract", () => ({
  extractTextSource: async (content: string) => ({ sourceType: "text", content, metadata: { extraction: "plain_text" } }),
  extractFileSource: mocks.extractFileSource, extractHtmlSource: mocks.extractHtmlSource, extractUrlSource: mocks.extractUrlSource,
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

  it("sends Word uploads through document extraction and retains their provenance", async () => {
    mocks.requireUser.mockResolvedValue({ userId: "user-1", clientId: "client-actual", role: "client" });
    mocks.extractFileSource.mockResolvedValue({ sourceType: "text", content: "Reviewed menu document.", metadata: { filename: "menu.docx", parser: "mammoth" } });
    const form = new FormData(); form.set("title", "Word menu");
    form.set("file", new File(["test transport"], "menu.docx"));
    const response = await POST(formRequest(form));
    expect(response.status).toBe(303);
    expect(mocks.extractFileSource).toHaveBeenCalledWith(expect.objectContaining({ name: "menu.docx" }));
    expect(mocks.submitKnowledgeSource).toHaveBeenCalledWith(expect.objectContaining({ clientId: "client-actual", sourceType: "text", metadata: { filename: "menu.docx", parser: "mammoth" } }));
  });

  it("extracts pasted HTML rather than storing markup as customer knowledge", async () => {
    mocks.requireUser.mockResolvedValue({ userId: "user-1", clientId: "client-actual", role: "client" });
    mocks.extractHtmlSource.mockResolvedValue({ sourceType: "text", content: "Menu details", metadata: { extraction: "html_text" } });
    const form = new FormData(); form.set("title", "Menu"); form.set("textFormat", "html"); form.set("content", "<p>Menu details</p>");
    expect((await POST(formRequest(form))).status).toBe(303);
    expect(mocks.extractHtmlSource).toHaveBeenCalledWith("<p>Menu details</p>");
    expect(mocks.submitKnowledgeSource).toHaveBeenCalledWith(expect.objectContaining({ content: "Menu details" }));
  });

  it("rejects ambiguous inputs instead of silently ignoring one source", async () => {
    mocks.requireUser.mockResolvedValue({ userId: "user-1", clientId: "client-actual", role: "client" });
    const form = new FormData(); form.set("title", "Menu"); form.set("sourceUrl", "https://example.com/menu"); form.set("content", "Another source");
    const response = await POST(formRequest(form));
    expect(response.status).toBe(400);
    expect(mocks.submitKnowledgeSource).not.toHaveBeenCalled();
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
