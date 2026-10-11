import { createHmac, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPool, vectorLiteral } from "@/lib/db";
import { encryptedChannelCredentialValues } from "@/lib/channels/credentials";
import { processInboundJob } from "@/lib/channels/inbox-worker";
import { flushRetryableOutboundMessages } from "@/lib/channels/outbox";
import { deterministicEmbedding } from "@/lib/llm/mock";
import { POST as whatsAppPost } from "@/app/api/webhooks/whatsapp/[channelId]/route";
import { POST as instagramPost } from "@/app/api/webhooks/instagram/[channelId]/route";

const dbDescribe = process.env.PRONTO_RUN_DB_TESTS === "1" ? describe : describe.skip;

dbDescribe("mock-verified Meta webhook to RAG to outbound queue demonstrations", () => {
  let clientId: string;
  let channelId: string;
  let kind: "whatsapp" | "instagram";
  let sourceId: string;
  const secret = "fixture-meta-app-secret";

  beforeEach(async () => {
    clientId = randomUUID(); channelId = randomUUID(); sourceId = randomUUID();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (!String(url).startsWith("https://graph.facebook.com/")) throw new Error("Unexpected external URL");
      return new Response(JSON.stringify(kind === "whatsapp"
        ? { messages: [{ id: "wamid.fixture-outbound" }] }
        : { message_id: "mid.fixture-outbound" }), { status: 200,
          headers: { "Content-Type": "application/json" } });
    }));
  });
  afterEach(async () => {
    await getPool().query("delete from clients where id = $1", [clientId]);
    vi.unstubAllGlobals();
  });
  afterAll(async () => { await getPool().end(); });

  async function setup(input: { channelKind: "whatsapp" | "instagram"; question: string; knowledge: string }) {
    kind = input.channelKind;
    const db = getPool();
    await db.query("insert into clients (id, name, slug, vertical, brand_voice) values ($1, 'Fixture Cafe', $2, 'fnb', 'Warm and brief')",
      [clientId, `s1-meta-${clientId}`]);
    const credentials = encryptedChannelCredentialValues({
      appSecret: secret, accessToken: "fixture-token", pageAccessToken: "fixture-token",
      phoneNumberId: "phone-a", igUserId: "ig-business-a",
      __settingsSecrets: { verifyToken: "fixture-verify" },
    });
    await db.query(
      `insert into channels (id, client_id, kind, name, status, external_id, credentials,
       encrypted_credentials, credentials_encryption_nonce, credentials_encryption_tag)
       values ($1, $2, $3, 'Fixture channel', 'active', $4, $5, $6, $7, $8)`,
      [channelId, clientId, kind, kind === "whatsapp" ? "phone-a" : "ig-business-a",
        credentials.credentials, credentials.encryptedCredentials, credentials.nonce, credentials.tag],
    );
    await db.query(
      `insert into agent_configs (client_id, prompt_preamble, retrieval_threshold)
       values ($1, 'Answer only from this tenant knowledge.', 0)`, [clientId],
    );
    await db.query(
      "insert into knowledge_sources (id, client_id, title, source_type, content) values ($1, $2, 'Fixture knowledge', 'manual', $3)",
      [sourceId, clientId, input.knowledge],
    );
    await db.query(
      `insert into knowledge_chunks (source_id, client_id, chunk_index, content, token_estimate,
       embedding, embedding_model, embedding_dimensions) values
       ($1, $2, 0, $3, 20, $4::vector, 'text-embedding-3-small', 1536)`,
      [sourceId, clientId, input.knowledge, vectorLiteral(deterministicEmbedding(input.question))],
    );
  }

  function request(payload: unknown) {
    const raw = JSON.stringify(payload);
    const signature = createHmac("sha256", secret).update(raw).digest("hex");
    return new Request(`http://localhost:3000/api/webhooks/${kind}/${channelId}`, {
      method: "POST", headers: { "x-hub-signature-256": `sha256=${signature}` }, body: raw,
    });
  }

  it("WhatsApp FAQ uses tenant hours and a fake Graph transport", async () => {
    const question = "What time do you close today?";
    await setup({ channelKind: "whatsapp", question,
      knowledge: "Fixture Cafe closes today at 9:00 PM Singapore time." });
    const payload = { object: "whatsapp_business_account", entry: [{ id: "waba-a", changes: [{
      field: "messages", value: { metadata: { phone_number_id: "phone-a" },
        messages: [{ id: "wamid.fixture-inbound", from: "6590000000", type: "text",
          timestamp: String(Math.floor(Date.now() / 1000)),
          text: { body: question } }] },
    }] }] };
    const response = await whatsAppPost(request(payload), { params: Promise.resolve({ channelId }) });
    expect(response.status).toBe(200);
    expect((await response.json()).accepted).toBe(1);
    expect((await getPool().query("select id from outbound_messages where client_id = $1", [clientId])).rows).toHaveLength(0);
    expect((await processInboundJob())?.outcome).toBe("answered");
    const queued = await getPool().query<{ body: string; status: string }>(
      "select body, status from outbound_messages where client_id = $1", [clientId]);
    expect(queued.rows[0]).toMatchObject({ status: "pending" });
    expect(queued.rows[0].body).toContain("9:00 PM");
    await flushRetryableOutboundMessages();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/phone-a/messages"),
      expect.objectContaining({ method: "POST" }));
  });

  it("Instagram enquiry uses tenant dietary knowledge and a fake Graph transport", async () => {
    const question = "Do you have vegetarian options?";
    await setup({ channelKind: "instagram", question,
      knowledge: "Fixture Cafe has vegetarian noodles and tofu rice bowls." });
    const payload = { object: "instagram", entry: [{ id: "ig-business-a", messaging: [{
      sender: { id: "ig-customer-a" }, recipient: { id: "ig-business-a" },
      timestamp: Date.now(),
      message: { mid: "mid.fixture-inbound", text: question },
    }] }] };
    const response = await instagramPost(request(payload), { params: Promise.resolve({ channelId }) });
    expect(response.status).toBe(200);
    expect((await response.json()).accepted).toBe(1);
    expect((await processInboundJob())?.outcome).toBe("answered");
    const queued = await getPool().query<{ body: string; status: string }>(
      "select body, status from outbound_messages where client_id = $1", [clientId]);
    expect(queued.rows[0].body).toContain("vegetarian noodles");
    await flushRetryableOutboundMessages();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/ig-business-a/messages"),
      expect.objectContaining({ method: "POST" }));
  });

  it("booking intent uses only the verified Chope link and never claims a booking", async () => {
    const question = "Can I book a table for 2 on 2099-10-12 at 7pm?";
    await setup({ channelKind: "whatsapp", question, knowledge: "Reservations are handled on Chope." });
    await getPool().query(
      "update clients set business_profile = $2::jsonb where id = $1",
      [clientId, JSON.stringify({ chopeBooking: { outletId: "fixture-cafe",
        url: "https://www.chope.co/singapore-restaurants/fixture-cafe",
        verifiedAt: "2026-10-11T00:00:00Z" } })],
    );
    const payload = { object: "whatsapp_business_account", entry: [{ id: "waba-a", changes: [{
      field: "messages", value: { metadata: { phone_number_id: "phone-a" },
        messages: [{ id: "wamid.booking-inbound", from: "6590000000", type: "text",
          timestamp: String(Math.floor(Date.now() / 1000)),
          text: { body: question } }] },
    }] }] };
    expect((await whatsAppPost(request(payload), { params: Promise.resolve({ channelId }) })).status).toBe(200);
    expect((await processInboundJob())?.outcome).toBe("answered");
    const queued = await getPool().query<{ body: string }>(
      "select body from outbound_messages where client_id = $1", [clientId]);
    expect(queued.rows[0].body).toContain("https://www.chope.co/singapore-restaurants/fixture-cafe");
    expect(queued.rows[0].body).toContain("I cannot confirm a reservation here");
    expect((await getPool().query("select id from escalations where client_id = $1", [clientId])).rows).toHaveLength(0);
  });

  it("hands unsupported WhatsApp content to a human and suppresses later AI work", async () => {
    await setup({ channelKind: "whatsapp", question: "Can you help?",
      knowledge: "Fixture Cafe can help with menu enquiries." });
    const message = (id: string, content: Record<string, unknown>) => ({
      object: "whatsapp_business_account", entry: [{ id: "waba-a", changes: [{
        field: "messages", value: { metadata: { phone_number_id: "phone-a" },
          messages: [{ id, from: "6590000000", timestamp: String(Math.floor(Date.now() / 1000)),
            ...content }] },
      }] }],
    });
    const image = message("wamid.media", { type: "image", image: { id: "fixture-image" } });
    expect((await whatsAppPost(request(image), { params: Promise.resolve({ channelId }) })).status).toBe(200);
    expect((await processInboundJob())?.outcome).toBe("escalated");
    const escalation = await getPool().query<{ status: string }>(
      "select status from escalations where client_id = $1", [clientId]);
    expect(escalation.rows).toHaveLength(1);
    expect(escalation.rows[0].status).toBe("open");
    await flushRetryableOutboundMessages();
    expect(fetch).toHaveBeenCalledTimes(1);

    const followup = message("wamid.after-handoff", { type: "text", text: { body: "Are you there?" } });
    expect((await whatsAppPost(request(followup), { params: Promise.resolve({ channelId }) })).status).toBe(200);
    expect((await processInboundJob())?.outcome).toBe("skipped");
    expect((await getPool().query("select id from outbound_messages where client_id = $1", [clientId])).rows).toHaveLength(1);
  });
});
