import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  updateKnowledgeSourceForClient: vi.fn(),
  deleteKnowledgeSourceForClient: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireUser: mocks.requireUser,
}));

vi.mock("@/lib/knowledge/manage", () => ({
  updateKnowledgeSourceForClient: mocks.updateKnowledgeSourceForClient,
  deleteKnowledgeSourceForClient: mocks.deleteKnowledgeSourceForClient,
}));

import { POST } from "@/app/api/operator/knowledge/[sourceId]/route";

describe("operator knowledge source route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({
      userId: "operator-1",
      clientId: null,
      role: "operator",
    });
  });

  it("updates a source scoped to the submitted client", async () => {
    mocks.updateKnowledgeSourceForClient.mockResolvedValueOnce({
      sourceId: "source-1",
      chunkCount: 1,
    });

    const form = new FormData();
    form.set("action", "update");
    form.set("clientId", "client-1");
    form.set("title", "Menu");
    form.set("content", "Kopi is SGD 2.20.");

    const response = await POST(formRequest(form), context("source-1"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/operator/clients/client-1/knowledge/source-1",
    );
    expect(mocks.updateKnowledgeSourceForClient).toHaveBeenCalledWith({
      sourceId: "source-1",
      clientId: "client-1",
      title: "Menu",
      content: "Kopi is SGD 2.20.",
      actorUserId: "operator-1",
    });
  });

  it("deletes a source scoped to the submitted client", async () => {
    mocks.deleteKnowledgeSourceForClient.mockResolvedValueOnce(true);

    const form = new FormData();
    form.set("action", "delete");
    form.set("clientId", "client-1");

    const response = await POST(formRequest(form), context("source-1"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/operator/clients/client-1/knowledge",
    );
    expect(mocks.deleteKnowledgeSourceForClient).toHaveBeenCalledWith({
      sourceId: "source-1",
      clientId: "client-1",
      actorUserId: "operator-1",
    });
  });

  it("returns not found when update is outside the submitted client scope", async () => {
    mocks.updateKnowledgeSourceForClient.mockResolvedValueOnce(null);

    const form = new FormData();
    form.set("action", "update");
    form.set("clientId", "client-other");
    form.set("title", "Menu");
    form.set("content", "Kopi is SGD 2.20.");

    const response = await POST(formRequest(form), context("source-1"));

    expect(response.status).toBe(404);
  });
});

function formRequest(form: FormData): Request {
  return new Request("http://localhost/api/operator/knowledge/source-1", {
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
