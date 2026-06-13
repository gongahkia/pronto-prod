import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  executeAssistantAction: vi.fn(),
  addAssistantMessage: vi.fn(),
  getPendingActionProposal: vi.fn(),
  markActionProposalExecuted: vi.fn(),
  markActionProposalFailed: vi.fn(),
  logWarn: vi.fn(),
  redactErrorMessage: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireUser: mocks.requireUser,
}));

vi.mock("@/lib/assistant/actions", () => ({
  executeAssistantAction: mocks.executeAssistantAction,
}));

vi.mock("@/lib/assistant/store", () => ({
  addAssistantMessage: mocks.addAssistantMessage,
  getPendingActionProposal: mocks.getPendingActionProposal,
  markActionProposalExecuted: mocks.markActionProposalExecuted,
  markActionProposalFailed: mocks.markActionProposalFailed,
}));

vi.mock("@/lib/logger", () => ({
  logWarn: mocks.logWarn,
  redactErrorMessage: mocks.redactErrorMessage,
}));

import { POST } from "@/app/api/assistant/actions/confirm/route";

const proposalId = "00000000-0000-4000-8000-000000000001";
const threadId = "00000000-0000-4000-8000-000000000002";
const messageId = "00000000-0000-4000-8000-000000000003";
const userId = "00000000-0000-4000-8000-000000000004";
const clientId = "00000000-0000-4000-8000-000000000005";

describe("assistant action confirmation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({
      userId,
      email: "operator@pronto.sg",
      name: "Operator",
      role: "operator",
      clientId: null,
    });
    mocks.redactErrorMessage.mockReturnValue("redacted");
    mocks.getPendingActionProposal.mockResolvedValue({
      id: proposalId,
      thread_id: threadId,
      message_id: messageId,
      user_id: userId,
      client_id: clientId,
      action_type: "escalation_resolve",
      title: "Resolve escalation",
      description: "Resolve with a reply.",
      payload: {
        escalationId: "escalation-1",
        reply: "Original reply",
      },
      status: "pending",
      requires_typed_confirmation: null,
      result: null,
      error: null,
      confirmed_at: null,
      executed_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    });
    mocks.executeAssistantAction.mockResolvedValue({
      message: "Escalation resolved.",
      href: "/operator/clients/client-1/conversations/conversation-1",
      nextActions: [
        {
          label: "Open conversation",
          href: "/operator/clients/client-1/conversations/conversation-1",
        },
      ],
    });
    mocks.addAssistantMessage.mockResolvedValue({
      id: "system-message-1",
      thread_id: threadId,
      user_id: null,
      role: "system",
      body: "Escalation resolved.",
      metadata: {},
      created_at: new Date(),
    });
  });

  it("executes the edited payload and stores it on the result", async () => {
    const editedPayload = {
      escalationId: "escalation-1",
      reply: "Edited reply",
    };

    const response = await POST(jsonRequest({ proposalId, editedPayload }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.executeAssistantAction).toHaveBeenCalledWith(
      expect.objectContaining({
        editedPayload,
        confirmationText: undefined,
      }),
    );
    expect(mocks.markActionProposalExecuted).toHaveBeenCalledWith({
      proposalId,
      result: expect.objectContaining({
        message: "Escalation resolved.",
        executedPayload: editedPayload,
        nextActions: [
          {
            label: "Open conversation",
            href: "/operator/clients/client-1/conversations/conversation-1",
          },
        ],
      }),
    });
    expect(mocks.addAssistantMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId,
        role: "system",
        body: "Escalation resolved.",
        metadata: expect.objectContaining({
          actionProposalId: proposalId,
          actionType: "escalation_resolve",
          nextActions: [
            {
              label: "Open conversation",
              href: "/operator/clients/client-1/conversations/conversation-1",
            },
          ],
        }),
      }),
    );
    expect(body.result.executedPayload).toEqual(editedPayload);
  });

  it("rejects malformed edited payloads before executing an action", async () => {
    const response = await POST(
      jsonRequest({
        proposalId,
        editedPayload: "not an object",
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.executeAssistantAction).not.toHaveBeenCalled();
  });
});

function jsonRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/assistant/actions/confirm", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      host: "localhost",
      origin: "http://localhost",
    },
    body: JSON.stringify(body),
  });
}
