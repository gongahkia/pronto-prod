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

vi.mock("@/lib/knowledge/parse-upload", () => ({
  parseKnowledgeUpload: vi.fn(),
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
    expect(mocks.stageKnowledge).not.toHaveBeenCalled();
  });

  it("stages knowledge for the authenticated client's account", async () => {
    mocks.requireUser.mockResolvedValueOnce({
      userId: "user-1",
      clientId: "client-actual",
      role: "client",
    });
    mocks.stageKnowledge.mockResolvedValueOnce("source-1");

    const form = new FormData();
    form.set("clientId", "client-forged");
    form.set("title", "Updated menu");
    form.set("content", "Kopi is SGD 2.20.");

    const response = await POST(formRequest(form));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/client/knowledge?staged=1");
    expect(mocks.stageKnowledge).toHaveBeenCalledWith({
      clientId: "client-actual",
      action: "upsert",
      title: "Updated menu",
      sourceType: "client_manual",
      content: "Kopi is SGD 2.20.",
      metadata: { entryMode: "client_manual" },
      actorUserId: "user-1",
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
