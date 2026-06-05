import { beforeEach, describe, expect, it, vi } from "vitest";
import { TriageFlowValidationError } from "@/lib/triage-flow";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  saveTriageFlowForClient: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireUser: mocks.requireUser,
}));

vi.mock("@/lib/triage-flow-store", () => ({
  saveTriageFlowForClient: mocks.saveTriageFlowForClient,
  flowResponse: vi.fn((flow: unknown) => flow),
}));

import { POST as clientPost } from "@/app/api/client/flows/route";
import { POST as operatorPost } from "@/app/api/operator/flows/route";

describe("triage flow routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.saveTriageFlowForClient.mockResolvedValue({
      id: "flow-1",
      clientId: "client-1",
      nodes: [],
      edges: [],
      compiledEscalationRules: {},
      version: 2,
      publishedAt: null,
      isDefault: false,
    });
  });

  it("lets a client save only their assigned client flow", async () => {
    mocks.requireUser.mockResolvedValueOnce({
      userId: "client-user-1",
      clientId: "client-1",
      role: "client",
    });

    const response = await clientPost(jsonRequest({ nodes: [], edges: [] }));

    expect(response.status).toBe(200);
    expect(mocks.saveTriageFlowForClient).toHaveBeenCalledWith({
      clientId: "client-1",
      actorUserId: "client-user-1",
      nodes: [],
      edges: [],
      source: "client",
    });
  });

  it("lets an operator save a scoped client flow", async () => {
    mocks.requireUser.mockResolvedValueOnce({
      userId: "operator-1",
      clientId: null,
      role: "operator",
    });

    const response = await operatorPost(
      jsonRequest({ clientId: "client-1", nodes: [], edges: [] }),
    );

    expect(response.status).toBe(200);
    expect(mocks.saveTriageFlowForClient).toHaveBeenCalledWith({
      clientId: "client-1",
      actorUserId: "operator-1",
      nodes: [],
      edges: [],
      source: "operator",
    });
  });

  it("rejects operator saves without a client ID", async () => {
    mocks.requireUser.mockResolvedValueOnce({
      userId: "operator-1",
      clientId: null,
      role: "operator",
    });

    const response = await operatorPost(jsonRequest({ nodes: [], edges: [] }));

    expect(response.status).toBe(400);
    expect(mocks.saveTriageFlowForClient).not.toHaveBeenCalled();
  });

  it("returns validation errors from the flow compiler", async () => {
    mocks.requireUser.mockResolvedValueOnce({
      userId: "client-user-1",
      clientId: "client-1",
      role: "client",
    });
    mocks.saveTriageFlowForClient.mockRejectedValueOnce(
      new TriageFlowValidationError("Flow contains an unknown node."),
    );

    const response = await clientPost(jsonRequest({ nodes: [], edges: [] }));
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("Flow contains an unknown node.");
  });
});

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/client/flows", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
