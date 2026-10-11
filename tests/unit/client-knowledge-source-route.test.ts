import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  stageKnowledge: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireUser: mocks.requireUser,
}));

vi.mock("@/lib/assistant-drafts", () => ({
  stageKnowledge: mocks.stageKnowledge,
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
    mocks.stageKnowledge.mockResolvedValueOnce("source-1");

    const form = new FormData();
    form.set("action", "update");
    form.set("title", "Menu");
    form.set("content", "Kopi is SGD 2.20.");

    const response = await POST(formRequest(form), context("source-1"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/client/knowledge/source-1?staged=1");
    expect(mocks.stageKnowledge).toHaveBeenCalledWith({
      sourceId: "source-1",
      clientId: "client-actual",
      title: "Menu",
      content: "Kopi is SGD 2.20.",
      actorUserId: "user-1",
      action: "upsert",
    });
  });

  it("deletes only the authenticated client's source", async () => {
    mocks.stageKnowledge.mockResolvedValueOnce("source-1");

    const form = new FormData();
    form.set("action", "delete");

    const response = await POST(formRequest(form), context("source-1"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/client/knowledge?staged=1");
    expect(mocks.stageKnowledge).toHaveBeenCalledWith({
      sourceId: "source-1",
      clientId: "client-actual",
      actorUserId: "user-1",
      action: "delete",
    });
  });

  it("returns not found when update is outside client scope", async () => {
    mocks.stageKnowledge.mockRejectedValueOnce(new Error("Knowledge source not found."));

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
