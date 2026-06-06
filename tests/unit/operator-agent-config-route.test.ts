import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  updateAgentConfigForClient: vi.fn(),
  logWarn: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireUser: mocks.requireUser,
}));

vi.mock("@/lib/agent/config", () => ({
  updateAgentConfigForClient: mocks.updateAgentConfigForClient,
}));

vi.mock("@/lib/logger", () => ({
  logWarn: mocks.logWarn,
}));

import { POST } from "@/app/api/operator/agent-config/route";

describe("operator agent config route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({
      userId: "operator-1",
      clientId: null,
      role: "operator",
    });
    mocks.updateAgentConfigForClient.mockResolvedValue({ config: { id: "config-1" } });
  });

  it("updates agent tuning for a client and redirects", async () => {
    const form = validForm();
    form.set("returnTo", "/operator/clients/client-1");

    const response = await POST(formRequest(form));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/operator/clients/client-1");
    expect(mocks.updateAgentConfigForClient).toHaveBeenCalledWith({
      clientId: "client-1",
      responseProvider: "mock",
      responseModel: "mock",
      embeddingProvider: "mock",
      embeddingModel: "mock",
      retrievalThreshold: 0.63,
      promptPreamble: "Answer from verified source material.",
      escalationRules: { sentimentTriggers: ["annoyed"] },
      actorUserId: "operator-1",
      changeReason: "Pilot tuning",
    });
  });

  it("accepts Azure OpenAI as a response and embedding provider", async () => {
    const form = validForm();
    form.set("responseProvider", "azure");
    form.set("responseModel", "northbridge-chat");
    form.set("embeddingProvider", "azure");
    form.set("embeddingModel", "northbridge-embedding");

    const response = await POST(formRequest(form));

    expect(response.status).toBe(303);
    expect(mocks.updateAgentConfigForClient).toHaveBeenCalledWith(
      expect.objectContaining({
        responseProvider: "azure",
        responseModel: "northbridge-chat",
        embeddingProvider: "azure",
        embeddingModel: "northbridge-embedding",
      }),
    );
  });

  it("rejects invalid retrieval thresholds before updating", async () => {
    const form = validForm();
    form.set("retrievalThreshold", "1.5");

    const response = await POST(formRequest(form));

    expect(response.status).toBe(400);
    expect(mocks.logWarn).toHaveBeenCalledWith(
      "agent_config.invalid_retrieval_threshold",
      expect.objectContaining({ clientId: "client-1" }),
    );
    expect(mocks.updateAgentConfigForClient).not.toHaveBeenCalled();
  });

  it("rejects escalation rules that are not a JSON object", async () => {
    const form = validForm();
    form.set("escalationRules", "[]");

    const response = await POST(formRequest(form));

    expect(response.status).toBe(400);
    expect(mocks.updateAgentConfigForClient).not.toHaveBeenCalled();
  });
});

function validForm(): FormData {
  const form = new FormData();
  form.set("clientId", "client-1");
  form.set("responseProvider", "mock");
  form.set("responseModel", "mock");
  form.set("embeddingProvider", "mock");
  form.set("embeddingModel", "mock");
  form.set("retrievalThreshold", "0.63");
  form.set("promptPreamble", "Answer from verified source material.");
  form.set("escalationRules", JSON.stringify({ sentimentTriggers: ["annoyed"] }));
  form.set("changeReason", "Pilot tuning");
  return form;
}

function formRequest(form: FormData): Request {
  return new Request("http://localhost/api/operator/agent-config", {
    method: "POST",
    body: form,
  });
}
