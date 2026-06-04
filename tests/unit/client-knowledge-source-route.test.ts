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

import { POST } from "@/app/api/client/knowledge/[sourceId]/route";

describe("client knowledge source route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({
      userId: "user-1",
      clientId: "client-actual",
      role: "client",
    });
  });

  it("updates only the authenticated client's source", async () => {
    mocks.updateKnowledgeSourceForClient.mockResolvedValueOnce({
      sourceId: "source-1",
      chunkCount: 1,
    });

    const form = new FormData();
    form.set("action", "update");
    form.set("title", "Menu");
    form.set("content", "Kopi is SGD 2.20.");

    const response = await POST(formRequest(form), context("source-1"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/client/knowledge/source-1");
    expect(mocks.updateKnowledgeSourceForClient).toHaveBeenCalledWith({
      sourceId: "source-1",
      clientId: "client-actual",
      title: "Menu",
      content: "Kopi is SGD 2.20.",
      actorUserId: "user-1",
    });
  });

  it("deletes only the authenticated client's source", async () => {
    mocks.deleteKnowledgeSourceForClient.mockResolvedValueOnce(true);

    const form = new FormData();
    form.set("action", "delete");

    const response = await POST(formRequest(form), context("source-1"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/client/knowledge");
    expect(mocks.deleteKnowledgeSourceForClient).toHaveBeenCalledWith({
      sourceId: "source-1",
      clientId: "client-actual",
      actorUserId: "user-1",
    });
  });

  it("returns not found when update is outside client scope", async () => {
    mocks.updateKnowledgeSourceForClient.mockResolvedValueOnce(null);

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
    body: form,
  });
}

function context(sourceId: string) {
  return {
    params: Promise.resolve({ sourceId }),
  };
}
