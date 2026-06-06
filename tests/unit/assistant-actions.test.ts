import { describe, expect, it } from "vitest";
import { isAssistantActionAllowedForUser } from "@/lib/assistant/actions";
import type { SessionUser } from "@/lib/auth";

const operator: SessionUser = {
  userId: "operator-1",
  email: "operator@pronto.sg",
  name: "Operator",
  role: "operator",
  clientId: null,
};

const client: SessionUser = {
  userId: "client-1",
  email: "owner@example.com",
  name: "Owner",
  role: "client",
  clientId: "client-actual",
};

describe("assistant action permissions", () => {
  it("allows operators to use the full action surface", () => {
    expect(isAssistantActionAllowedForUser(operator, "client_create")).toBe(true);
    expect(isAssistantActionAllowedForUser(operator, "offboarding_delete")).toBe(true);
    expect(isAssistantActionAllowedForUser(operator, "agent_config_update")).toBe(true);
  });

  it("limits client users to client-safe actions", () => {
    expect(isAssistantActionAllowedForUser(client, "knowledge_refresh_create")).toBe(true);
    expect(isAssistantActionAllowedForUser(client, "assistant_request_create")).toBe(true);
    expect(isAssistantActionAllowedForUser(client, "client_create")).toBe(false);
    expect(isAssistantActionAllowedForUser(client, "channel_update")).toBe(false);
    expect(isAssistantActionAllowedForUser(client, "offboarding_delete")).toBe(false);
  });
});
