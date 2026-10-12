import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAssistantDraft,
  markAssistantDraftTested,
  publishAssistantDraft,
  retrieveDraftKnowledge,
  stageKnowledge,
  stageVoice,
} from "@/lib/assistant-drafts";
import {
  publishChannelDraft,
  saveChannelDraft,
} from "@/lib/client-channel-drafts";
import { decryptChannelCredentials } from "@/lib/channels/credentials";
import { getPool } from "@/lib/db";
import { approveConfiguration } from "@/lib/managed-approvals";
import type { SessionUser } from "@/lib/auth";
import type { Channel } from "@/lib/types";

const dbDescribe = process.env.PRONTO_RUN_DB_TESTS === "1" ? describe : describe.skip;

dbDescribe("client assistant drafts in PostgreSQL", () => {
  let clientId: string;
  let actorUserId: string;
  let operatorUserId: string;

  beforeEach(async () => {
    clientId = randomUUID();
    actorUserId = randomUUID();
    operatorUserId = randomUUID();
    vi.stubEnv("PRONTO_USE_MOCK_AI", "1");
    vi.stubEnv("PRONTO_SECRETS_KEY", "test-secret-material-with-at-least-32-chars");
    await getPool().query(
      "insert into clients (id, name, slug, vertical, brand_voice) values ($1, 'Draft test', $2, 'test', 'Original voice')",
      [clientId, `draft-test-${clientId}`],
    );
    await getPool().query(
      "insert into users (id, client_id, email, name, role, password_hash) values ($1, $2, $3, 'Test owner', 'client', 'unused')",
      [actorUserId, clientId, `draft-test-${actorUserId}@example.com`],
    );
    await getPool().query(
      "insert into users (id, email, name, role, password_hash) values ($1, $2, 'Test operator', 'operator', 'unused')",
      [operatorUserId, `draft-test-${operatorUserId}@example.com`],
    );
    await getPool().query(
      "insert into staff_permission_grants (client_id, user_id, permission, granted_by) values ($1, $2, 'knowledge.approve', $3)",
      [clientId, actorUserId, operatorUserId],
    );
    await getPool().query(
      "insert into agent_configs (client_id, prompt_preamble) values ($1, 'Answer from knowledge')",
      [clientId],
    );
  });

  afterEach(async () => {
    await getPool().query("delete from clients where id = $1", [clientId]);
    await getPool().query("delete from users where id = $1", [operatorUserId]);
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    await getPool().end();
  });

  it("keeps knowledge and voice in draft until the tested revision is published", async () => {
    const sourceId = await stageKnowledge({
      clientId, actorUserId, action: "upsert", title: "Opening hours",
      content: "We open every Sunday from 10am to 10pm.",
    });
    await stageVoice({
      clientId, actorUserId,
      voice: { title: "Voice guide", content: "Reply warmly and concisely.", examples: [] },
    });

    const draft = await getAssistantDraft(clientId);
    expect(draft?.knowledge_changes[sourceId]?.title).toBe("Opening hours");
    expect((await getPool().query("select id from knowledge_sources where id = $1", [sourceId])).rowCount).toBe(0);
    expect((await retrieveDraftKnowledge(clientId, Array(1536).fill(0.01), null, "Sunday", 5)).length).toBe(1);
    await expect(publishAssistantDraft(clientId, actorUserId)).rejects.toThrow("Pronto operator");
    await expect(publishAssistantDraft(clientId, operatorUserId)).rejects.toThrow("Test the current draft");

    await markAssistantDraftTested(clientId, draft!.edit_version);
    const approver: SessionUser = { userId: actorUserId, role: "client", clientId,
      name: "Test owner", email: `draft-test-${actorUserId}@example.com` };
    await approveConfiguration({ actor: approver,
      clientId, kind: "assistant", targetId: clientId, revision: String(draft!.edit_version), evidence: "Reviewed draft" });
    await stageVoice({
      clientId, actorUserId,
      voice: { title: "Voice guide", content: "Reply warmly and concisely.", examples: [] },
    });
    await expect(publishAssistantDraft(clientId, operatorUserId)).rejects.toThrow("Test the current draft");
    await markAssistantDraftTested(clientId, draft!.edit_version);
    await expect(publishAssistantDraft(clientId, operatorUserId)).rejects.toThrow("Test the current draft");
    await markAssistantDraftTested(clientId, (await getAssistantDraft(clientId))!.edit_version);
    await expect(publishAssistantDraft(clientId, operatorUserId)).rejects.toThrow("business approval");
    await approveConfiguration({ actor: approver,
      clientId, kind: "assistant", targetId: clientId,
      revision: String((await getAssistantDraft(clientId))!.edit_version), evidence: "Reviewed latest draft" });
    expect(await publishAssistantDraft(clientId, operatorUserId)).toBe(1);
    expect((await getPool().query("select title from knowledge_sources where id = $1", [sourceId])).rows[0].title)
      .toBe("Opening hours");
    expect((await getPool().query("select brand_voice from clients where id = $1", [clientId])).rows[0].brand_voice)
      .toBe("Reply warmly and concisely.");
    expect(await getAssistantDraft(clientId)).toBeNull();
  });

  it("stores client channel webhook secrets encrypted and requires a check before activation", async () => {
    const channelId = randomUUID();
    await getPool().query(
      "insert into channels (id, client_id, kind, name, status) values ($1, $2, 'whatsapp', 'Test channel', 'draft')",
      [channelId, clientId],
    );
    await saveChannelDraft({
      clientId, channelId, actorUserId, status: "active", externalId: "phone-id",
      values: {
        "credentials.accessToken": "access-token",
        "credentials.phoneNumberId": "phone-id",
        "credentials.appSecret": "app-secret",
        "settings.verifyToken": "verify-secret",
      },
    });
    const storedDraft = await getPool().query<{ settings: Record<string, unknown>; encrypted_credentials: string }>(
      "select settings, encrypted_credentials from channel_drafts where channel_id = $1",
      [channelId],
    );
    expect(storedDraft.rows[0].settings).not.toHaveProperty("verifyToken");
    expect(storedDraft.rows[0].encrypted_credentials).not.toContain("verify-secret");
    await expect(publishChannelDraft({ clientId, channelId, actorUserId }))
      .rejects.toThrow("Pronto operator");
    await expect(publishChannelDraft({ clientId, channelId, actorUserId: operatorUserId }))
      .rejects.toThrow("successful live health check");

    await saveChannelDraft({
      clientId, channelId, actorUserId, status: "draft", externalId: "phone-id", values: {},
    });
    await publishChannelDraft({ clientId, channelId, actorUserId: operatorUserId });
    const storedLive = await getPool().query<Channel>("select * from channels where id = $1", [channelId]);
    expect(storedLive.rows[0].settings).not.toHaveProperty("verifyToken");
    const exposed = decryptChannelCredentials(storedLive.rows[0]);
    expect(exposed.settings.verifyToken).toBe("verify-secret");
    expect(exposed.credentials.accessToken).toBe("access-token");
  });
});
