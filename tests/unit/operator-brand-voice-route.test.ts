import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(), getAssistantDraft: vi.fn(), stageVoice: vi.fn(),
  getBrandVoiceProfile: vi.fn(), getClient: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/assistant-drafts", () => ({
  getAssistantDraft: mocks.getAssistantDraft, stageVoice: mocks.stageVoice,
}));
vi.mock("@/lib/brand-voice", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/brand-voice")>(),
  getBrandVoiceProfile: mocks.getBrandVoiceProfile,
}));
vi.mock("@/lib/dashboard", () => ({ getClient: mocks.getClient }));

import { POST } from "@/app/api/operator/brand-voice/route";

describe("operator brand voice proposal route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ userId: "operator-1", clientId: null, role: "operator" });
    mocks.getAssistantDraft.mockResolvedValue(null);
    mocks.getBrandVoiceProfile.mockResolvedValue({ document: null, examples: [] });
    mocks.getClient.mockResolvedValue({ id: "client-1", name: "North Bridge Nasi" });
  });

  it("stages the voice guide instead of changing live voice", async () => {
    const form = baseForm("update_document");
    form.set("title", "North Bridge voice guide");
    form.set("content", "Warm and concise.");
    form.set("attributes", JSON.stringify({ formality: "casual" }));
    form.set("sourceNotes", "Founder samples");
    const response = await POST(formRequest(form));
    expect(response.status).toBe(200);
    expect(mocks.stageVoice).toHaveBeenCalledWith({ clientId: "client-1", actorUserId: "operator-1",
      voice: { title: "North Bridge voice guide", content: "Warm and concise.",
        attributes: { formality: "casual" }, sourceNotes: "Founder samples", examples: [] } });
  });

  it("rejects malformed attributes without staging", async () => {
    const form = baseForm("update_document");
    form.set("title", "Voice"); form.set("content", "Use source-backed replies.");
    form.set("attributes", "[]");
    expect((await POST(formRequest(form))).status).toBe(400);
    expect(mocks.stageVoice).not.toHaveBeenCalled();
  });

  it("stages an example instead of publishing it", async () => {
    const form = baseForm("add_example");
    form.set("customerMessage", "Are you open?");
    form.set("idealResponse", "Yes, until 10pm.");
    form.set("notes", "Example");
    expect((await POST(formRequest(form))).status).toBe(200);
    expect(mocks.stageVoice).toHaveBeenCalledWith(expect.objectContaining({
      voice: expect.objectContaining({ examples: [{ customerMessage: "Are you open?",
        idealResponse: "Yes, until 10pm.", notes: "Example", active: true }] }),
    }));
  });

  it("rejects editing an unknown example", async () => {
    const form = baseForm("toggle_example");
    form.set("exampleId", "other-client-example");
    expect((await POST(formRequest(form))).status).toBe(404);
    expect(mocks.stageVoice).not.toHaveBeenCalled();
  });
});

function baseForm(action: string): FormData {
  const form = new FormData();
  form.set("clientId", "client-1"); form.set("action", action);
  return form;
}
function formRequest(form: FormData): Request {
  return new Request("http://localhost/api/operator/brand-voice", {
    method: "POST", headers: { host: "localhost", origin: "http://localhost" }, body: form,
  });
}
