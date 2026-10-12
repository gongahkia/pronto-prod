import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  submitKnowledgeSource: vi.fn(), getKnowledgeSourceForClient: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireUser: mocks.requireUser,
}));

vi.mock("@/lib/knowledge/submissions", () => ({
  submitKnowledgeSource: mocks.submitKnowledgeSource,
}));
vi.mock("@/lib/knowledge/manage", () => ({ getKnowledgeSourceForClient: mocks.getKnowledgeSourceForClient }));

import { POST } from "@/app/api/client/knowledge/[sourceId]/route";

describe("client knowledge source route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({
      userId: "user-1",
      clientId: "client-actual",
      role: "client",
    });
    mocks.getKnowledgeSourceForClient.mockResolvedValue({ id: "source-1", title: "Menu", client_id: "client-actual" });
  });

  it("updates only the authenticated client's source", async () => {
    mocks.submitKnowledgeSource.mockResolvedValueOnce({ id: "submission-1", revision: 1 });

    const form = new FormData();
    form.set("action", "update");
    form.set("title", "Menu");
    form.set("content", "Kopi is SGD 2.20.");

    const response = await POST(formRequest(form), context("source-1"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/client/knowledge/source-1?submitted=1");
    expect(mocks.submitKnowledgeSource).toHaveBeenCalledWith({
      actor: expect.objectContaining({ userId: "user-1" }), targetSourceId: "source-1",
      clientId: "client-actual",
      title: "Menu",
      content: "Kopi is SGD 2.20.",
      sourceType: "text", description: "Replacement of published source.",
    });
  });

  it("deletes only the authenticated client's source", async () => {
    mocks.submitKnowledgeSource.mockResolvedValueOnce({ id: "submission-1", revision: 1 });

    const form = new FormData();
    form.set("action", "delete");

    const response = await POST(formRequest(form), context("source-1"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/client/knowledge?submitted=1");
    expect(mocks.submitKnowledgeSource).toHaveBeenCalledWith({
      actor: expect.objectContaining({ userId: "user-1" }), targetSourceId: "source-1",
      clientId: "client-actual",
      action: "archive", sourceType: "text", title: "Menu", content: "Archived after review.",
    });
  });

  it("returns not found when update is outside client scope", async () => {
    mocks.getKnowledgeSourceForClient.mockResolvedValueOnce(null);

    const form = new FormData();
    form.set("action", "update");
    form.set("title", "Menu");
    form.set("content", "Kopi is SGD 2.20.");

    const response = await POST(formRequest(form), context("source-other"));
    expect(response.status).toBe(404);
  });
});

function formRequest(form: FormData): Request {
  return new Request("http://localhost/api/client/knowledge/source-1", {
    method: "POST",
    headers: {
      host: "localhost",
      origin: "http://localhost",
    },
    body: form,
  });
}

function context(sourceId: string) {
  return {
    params: Promise.resolve({ sourceId }),
  };
}
