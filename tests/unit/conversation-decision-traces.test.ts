import { beforeEach, describe, expect, it, vi } from "vitest";
const query = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ query }));
import { getConversationDecisionTraces } from "@/lib/conversation-decision-traces";
beforeEach(() => query.mockResolvedValue({ rows: [] }));
describe("conversation decision trace access", () => {
  it("scopes messages, traces, usage, sources and replies to the authenticated business", async () => {
    expect(await getConversationDecisionTraces("tenant", "conversation")).toEqual([]);
    const [sql, parameters] = query.mock.calls[0];
    expect(parameters).toEqual(["tenant", "conversation"]);
    for (const predicate of ["m.client_id=$1", "m.conversation_id=$2", "trace.client_id=m.client_id", "u.client_id=m.client_id",
      "k.client_id=m.client_id", "s.client_id=m.client_id", "a.client_id=m.client_id", "c.deleted_at is null"])
      expect(sql).toContain(predicate);
  });
});
