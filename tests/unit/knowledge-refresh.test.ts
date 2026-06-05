import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  query: mocks.query,
}));

import {
  createKnowledgeRefreshRequest,
  getKnowledgeRefreshRequests,
  resolveKnowledgeRefreshRequest,
} from "@/lib/knowledge/refresh";
import type { KnowledgeRefreshRequest } from "@/lib/types";

describe("knowledge refresh workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists refresh requests for a client", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [refreshRequest()] });

    const result = await getKnowledgeRefreshRequests("client-1", 3);

    expect(result).toHaveLength(1);
    expect(mocks.query.mock.calls[0][0]).toContain("knowledge_refresh_requests");
    expect(mocks.query.mock.calls[0][1]).toEqual(["client-1", 3]);
  });

  it("creates a monthly refresh request with normalized notes", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [refreshRequest()] });

    await createKnowledgeRefreshRequest({
      clientId: "client-1",
      actorUserId: "user-1",
      notes: "  Check holiday hours.  ",
    });

    expect(mocks.query.mock.calls[0][1]).toEqual([
      "client-1",
      "monthly",
      expect.any(Date),
      "Check holiday hours.",
      "user-1",
    ]);
  });

  it("resolves only open refresh requests scoped to the client", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [refreshRequest({ status: "completed" })],
    });

    const result = await resolveKnowledgeRefreshRequest({
      requestId: "refresh-1",
      clientId: "client-1",
      actorUserId: "user-1",
      status: "completed",
    });

    expect(result?.status).toBe("completed");
    expect(mocks.query.mock.calls[0][0]).toContain("and status = 'open'");
    expect(mocks.query.mock.calls[0][1]).toEqual([
      "refresh-1",
      "client-1",
      "completed",
      null,
      "user-1",
    ]);
  });
});

function refreshRequest(
  overrides: Partial<KnowledgeRefreshRequest> = {},
): KnowledgeRefreshRequest {
  return {
    id: "refresh-1",
    client_id: "client-1",
    status: "open",
    cadence: "monthly",
    due_at: new Date(),
    notes: null,
    created_by_user_id: "user-1",
    completed_by_user_id: null,
    completed_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}
