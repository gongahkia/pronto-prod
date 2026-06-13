import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
}));

vi.mock("pg", () => ({
  Pool: vi.fn(function Pool() {
    return {
      query: mocks.poolQuery,
    };
  }),
}));

import { query } from "@/lib/db";
import { enterTenantContext } from "@/lib/tenant-context";

describe("tenant SQL gate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    mocks.poolQuery.mockReset();
    enterTenantContext({ role: "operator", clientId: null });
  });

  it("rejects client-session queries touching tenant tables without client_id", async () => {
    vi.stubEnv("PRONTO_ENFORCE_TENANT_SQL", "1");
    enterTenantContext({ role: "client", clientId: "client-1" });

    await expect(
      query("select * from messages where conversation_id = $1", ["conversation-1"]),
    ).rejects.toThrow("client_id");
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });

  it("allows client-session tenant queries with client_id", async () => {
    vi.stubEnv("PRONTO_ENFORCE_TENANT_SQL", "1");
    enterTenantContext({ role: "client", clientId: "client-1" });
    mocks.poolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(
      query("select * from messages where conversation_id = $1 and client_id = $2", [
        "conversation-1",
        "client-1",
      ]),
    ).resolves.toEqual({ rows: [], rowCount: 0 });
  });

  it("rejects client-session tenant queries bound to another client", async () => {
    vi.stubEnv("PRONTO_ENFORCE_TENANT_SQL", "1");
    enterTenantContext({ role: "client", clientId: "client-1" });

    await expect(
      query("select * from messages where conversation_id = $1 and client_id = $2", [
        "conversation-1",
        "client-2",
      ]),
    ).rejects.toThrow("client_id");
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });

  it("rejects client-session queries that only mention client_id without a bound predicate", async () => {
    vi.stubEnv("PRONTO_ENFORCE_TENANT_SQL", "1");
    enterTenantContext({ role: "client", clientId: "client-1" });

    await expect(
      query("select client_id, body from messages where conversation_id = $1", [
        "conversation-1",
      ]),
    ).rejects.toThrow("client_id");
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });

  it("rejects tenant inserts when client_id is omitted but appears in unrelated metadata", async () => {
    vi.stubEnv("PRONTO_ENFORCE_TENANT_SQL", "1");
    enterTenantContext({ role: "client", clientId: "client-1" });

    await expect(
      query(
        `
          insert into messages (conversation_id, channel_id, external_message_id, sender_role, body, metadata)
          values ($1, $2, $3, 'customer', $4, $5)
        `,
        [
          "conversation-1",
          "channel-1",
          "message-1",
          "Hello",
          { echoedClientId: "client-1" },
        ],
      ),
    ).rejects.toThrow("client_id");
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });

  it("rejects tenant inserts when client_id is bound to another client", async () => {
    vi.stubEnv("PRONTO_ENFORCE_TENANT_SQL", "1");
    enterTenantContext({ role: "client", clientId: "client-1" });

    await expect(
      query(
        `
          insert into messages (conversation_id, client_id, channel_id, external_message_id, sender_role, body, metadata)
          values ($1, $2, $3, $4, 'customer', $5, $6)
        `,
        [
          "conversation-1",
          "client-2",
          "channel-1",
          "message-1",
          "Hello",
          { echoedClientId: "client-1" },
        ],
      ),
    ).rejects.toThrow("client_id");
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });

  it("allows tenant inserts when client_id is explicitly bound to the session client", async () => {
    vi.stubEnv("PRONTO_ENFORCE_TENANT_SQL", "1");
    enterTenantContext({ role: "client", clientId: "client-1" });
    mocks.poolQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await expect(
      query(
        `
          insert into messages (conversation_id, client_id, channel_id, external_message_id, sender_role, body, metadata)
          values ($1, $2, $3, $4, 'customer', $5, $6)
        `,
        [
          "conversation-1",
          "client-1",
          "channel-1",
          "message-1",
          "Hello",
          { echoedClientId: "client-2" },
        ],
      ),
    ).resolves.toEqual({ rows: [], rowCount: 1 });
  });
});
