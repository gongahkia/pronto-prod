import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPool } from "@/lib/db";
import { sendChannelText } from "@/lib/channels/dispatch";
import { recordWhatsAppStatusEvents } from "@/lib/channels/whatsapp";

const fakes = vi.hoisted(() => ({
  sendWhatsAppText: vi.fn(async () => "wamid.sent-a"),
  sendInstagramText: vi.fn(async () => "mid.sent-a"),
}));
vi.mock("@/lib/channels/whatsapp", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/channels/whatsapp")>()),
  sendWhatsAppText: fakes.sendWhatsAppText,
}));
vi.mock("@/lib/channels/instagram", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/channels/instagram")>()),
  sendInstagramText: fakes.sendInstagramText,
}));
vi.mock("@/lib/channels/health", () => ({ recordOutboundHealth: vi.fn(async () => undefined) }));

const dbDescribe = process.env.PRONTO_RUN_DB_TESTS === "1" ? describe : describe.skip;

dbDescribe("Meta delivery policy with isolated PostgreSQL", () => {
  let clientId: string;
  let whatsappId: string;
  let instagramId: string;
  let conversationId: string;

  beforeEach(async () => {
    clientId = randomUUID(); whatsappId = randomUUID(); instagramId = randomUUID();
    conversationId = randomUUID();
    vi.clearAllMocks();
    fakes.sendWhatsAppText.mockResolvedValue("wamid.sent-a");
    fakes.sendInstagramText.mockResolvedValue("mid.sent-a");
    const db = getPool();
    await db.query("insert into clients (id, name, slug, vertical, brand_voice) values ($1, 'Meta test', $2, 'fnb', 'Clear')",
      [clientId, `meta-test-${clientId}`]);
    await db.query(
      `insert into channels (id, client_id, kind, name, status, external_id) values
       ($1, $2, 'whatsapp', 'WhatsApp', 'active', 'phone-a'),
       ($3, $2, 'instagram', 'Instagram', 'active', 'ig-a')`,
      [whatsappId, clientId, instagramId],
    );
    await db.query(
      `insert into conversations (id, client_id, channel_id, external_thread_id, customer_handle)
       values ($1, $2, $3, 'customer-a', 'customer-a')`,
      [conversationId, clientId, whatsappId],
    );
    await db.query(
      `insert into messages (conversation_id, client_id, channel_id, external_message_id, sender_role, body, metadata)
       values ($1, $2, $3, $4, 'customer', 'Hello', $5)`,
      [conversationId, clientId, whatsappId, randomUUID(), { providerOccurredAt: new Date().toISOString() }],
    );
  });
  afterEach(async () => { await getPool().query("delete from clients where id = $1", [clientId]); });
  afterAll(async () => { await getPool().end(); });

  it("sends a WhatsApp text only to a recent customer and identifies the correct channel", async () => {
    expect(await sendChannelText({ channelId: whatsappId, clientId,
      externalThreadId: "customer-a", text: "We close at 9 pm." }))
      .toEqual({ providerMessageId: "wamid.sent-a" });
    expect(fakes.sendWhatsAppText).toHaveBeenCalledWith(expect.objectContaining({ externalThreadId: "customer-a" }));
    await expect(sendChannelText({ channelId: whatsappId, clientId,
      externalThreadId: "wrong-customer", text: "Private answer" })).rejects.toThrow(/window/);
    expect(fakes.sendWhatsAppText).toHaveBeenCalledTimes(1);
  });

  it("does not open a Meta free-text window from database receipt time alone", async () => {
    await getPool().query("update messages set metadata = '{}'::jsonb where conversation_id = $1 and sender_role = 'customer'",
      [conversationId]);
    await expect(sendChannelText({ channelId: whatsappId, clientId,
      externalThreadId: "customer-a", text: "Hello" })).rejects.toThrow(/window/);
    expect(fakes.sendWhatsAppText).not.toHaveBeenCalled();
  });

  it("uses an explicitly approved WhatsApp template outside the customer window", async () => {
    await getPool().query(
      `update messages set metadata = jsonb_set(metadata, '{providerOccurredAt}', to_jsonb($2::text), true)
       where conversation_id = $1 and sender_role = 'customer'`,
      [conversationId, new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()],
    );
    await expect(sendChannelText({ channelId: whatsappId, clientId,
      externalThreadId: "customer-a", text: "Too late" })).rejects.toThrow(/window/);
    await sendChannelText({ channelId: whatsappId, clientId, externalThreadId: "customer-b",
      text: "Template only", policy: { purpose: "proactive_notification",
        whatsappTemplateName: "approved_followup", whatsappTemplateApproved: true } });
    expect(fakes.sendWhatsAppText).toHaveBeenCalledWith(expect.objectContaining({
      externalThreadId: "customer-b", template: { name: "approved_followup", languageCode: "en_US" },
    }));
  });

  it("requires a customer-initiated Instagram thread and active channel", async () => {
    await expect(sendChannelText({ channelId: instagramId, clientId,
      externalThreadId: "ig-customer", text: "Hello" })).rejects.toThrow(/customer-initiated/);
    const conversation = randomUUID();
    await getPool().query(
      "insert into conversations (id, client_id, channel_id, external_thread_id, customer_handle) values ($1, $2, $3, 'ig-customer', 'ig-customer')",
      [conversation, clientId, instagramId],
    );
    await getPool().query(
      `insert into messages (conversation_id, client_id, channel_id, external_message_id, sender_role, body, metadata)
       values ($1, $2, $3, $4, 'customer', 'Vegetarian options?', $5)`,
      [conversation, clientId, instagramId, randomUUID(), { providerOccurredAt: new Date().toISOString() }],
    );
    expect(await sendChannelText({ channelId: instagramId, clientId,
      externalThreadId: "ig-customer", text: "Yes" })).toEqual({ providerMessageId: "mid.sent-a" });
    await getPool().query("update channels set status = 'disabled' where id = $1", [instagramId]);
    await expect(sendChannelText({ channelId: instagramId, clientId,
      externalThreadId: "ig-customer", text: "No" })).rejects.toThrow(/disabled/);
    expect(fakes.sendInstagramText).toHaveBeenCalledTimes(1);
  });

  it("blocks outbound Meta sends when the configured Graph version is expired", async () => {
    vi.stubEnv("WHATSAPP_GRAPH_VERSION", "v20.0");
    try {
      await expect(sendChannelText({ channelId: whatsappId, clientId,
        externalThreadId: "customer-a", text: "Hello" })).rejects.toThrow(/expired/);
      expect(fakes.sendWhatsAppText).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("records WhatsApp delivery states against only this tenant's provider message", async () => {
    const inserted = await getPool().query<{ id: string }>(
      `insert into outbound_messages (client_id, conversation_id, channel_id, external_thread_id, body,
       idempotency_key, status, metadata) values ($1, $2, $3, 'customer-a', 'Hello', $4, 'sent', $5) returning id`,
      [clientId, conversationId, whatsappId, randomUUID(), { providerMessageId: "wamid.sent-a" }],
    );
    const payload = { entry: [{ changes: [{ value: { statuses: [{ id: "wamid.sent-a", status: "delivered" }] } }] }] };
    expect(await recordWhatsAppStatusEvents({ id: whatsappId, client_id: clientId }, payload)).toBe(1);
    const row = await getPool().query<{ metadata: Record<string, unknown> }>(
      "select metadata from outbound_messages where id = $1", [inserted.rows[0].id]);
    expect(row.rows[0].metadata.providerStatus).toBe("delivered");
    expect(await recordWhatsAppStatusEvents({ id: instagramId, client_id: clientId }, payload)).toBe(0);
  });
});
