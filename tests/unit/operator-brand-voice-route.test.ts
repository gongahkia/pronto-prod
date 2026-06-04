import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  updateBrandVoiceDocument: vi.fn(),
  addBrandVoiceExample: vi.fn(),
  setBrandVoiceExampleActive: vi.fn(),
  deleteBrandVoiceExample: vi.fn(),
  getClient: vi.fn(),
  logWarn: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireUser: mocks.requireUser,
}));

vi.mock("@/lib/brand-voice", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/brand-voice")>();
  return {
    ...actual,
    updateBrandVoiceDocument: mocks.updateBrandVoiceDocument,
    addBrandVoiceExample: mocks.addBrandVoiceExample,
    setBrandVoiceExampleActive: mocks.setBrandVoiceExampleActive,
    deleteBrandVoiceExample: mocks.deleteBrandVoiceExample,
  };
});

vi.mock("@/lib/dashboard", () => ({
  getClient: mocks.getClient,
}));

vi.mock("@/lib/logger", () => ({
  logWarn: mocks.logWarn,
}));

import { POST } from "@/app/api/operator/brand-voice/route";

describe("operator brand voice route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({
      userId: "operator-1",
      clientId: null,
      role: "operator",
    });
    mocks.updateBrandVoiceDocument.mockResolvedValue({ id: "doc-1" });
    mocks.addBrandVoiceExample.mockResolvedValue({ id: "example-1" });
    mocks.setBrandVoiceExampleActive.mockResolvedValue(true);
    mocks.deleteBrandVoiceExample.mockResolvedValue(true);
    mocks.getClient.mockResolvedValue({ id: "client-1", name: "North Bridge Nasi" });
  });

  it("updates the editable brand voice document", async () => {
    const form = baseForm("update_document");
    form.set("title", "North Bridge voice guide");
    form.set("content", "Warm, concise, and Singapore-aware.");
    form.set("attributes", JSON.stringify({ formality: "casual" }));
    form.set("sourceNotes", "Founder writing samples");

    const response = await POST(formRequest(form));

    expect(mocks.updateBrandVoiceDocument).toHaveBeenCalledWith({
      clientId: "client-1",
      title: "North Bridge voice guide",
      content: "Warm, concise, and Singapore-aware.",
      attributes: { formality: "casual" },
      sourceNotes: "Founder writing samples",
      actorUserId: "operator-1",
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/operator/clients/client-1",
    );
  });

  it("rejects invalid brand voice attributes JSON", async () => {
    const form = baseForm("update_document");
    form.set("title", "Voice");
    form.set("content", "Use source-backed replies.");
    form.set("attributes", "[]");

    const response = await POST(formRequest(form));

    expect(response.status).toBe(400);
    expect(mocks.logWarn).toHaveBeenCalledWith(
      "brand_voice.invalid_attributes_json",
      expect.objectContaining({ clientId: "client-1" }),
    );
    expect(mocks.updateBrandVoiceDocument).not.toHaveBeenCalled();
  });

  it("adds few-shot examples", async () => {
    const form = baseForm("add_example");
    form.set("customerMessage", "Can lah, are you open?");
    form.set("idealResponse", "Yes, we are open from 10 AM to 10 PM.");
    form.set("notes", "Singlish-friendly");

    const response = await POST(formRequest(form));

    expect(mocks.addBrandVoiceExample).toHaveBeenCalledWith({
      clientId: "client-1",
      customerMessage: "Can lah, are you open?",
      idealResponse: "Yes, we are open from 10 AM to 10 PM.",
      notes: "Singlish-friendly",
      actorUserId: "operator-1",
    });
    expect(response.status).toBe(303);
  });

  it("sanitizes redirects to operator-owned paths", async () => {
    const form = baseForm("toggle_example");
    form.set("exampleId", "example-1");
    form.set("isActive", "false");
    form.set("returnTo", "/client/settings");

    const response = await POST(formRequest(form));

    expect(mocks.setBrandVoiceExampleActive).toHaveBeenCalledWith({
      clientId: "client-1",
      exampleId: "example-1",
      isActive: false,
      actorUserId: "operator-1",
    });
    expect(response.headers.get("location")).toBe(
      "http://localhost/operator/clients/client-1",
    );
  });
});

function baseForm(action: string): FormData {
  const form = new FormData();
  form.set("clientId", "client-1");
  form.set("action", action);
  form.set("returnTo", "/operator/clients/client-1");
  return form;
}

function formRequest(form: FormData): Request {
  return new Request("http://localhost/api/operator/brand-voice", {
    method: "POST",
    body: form,
  });
}
