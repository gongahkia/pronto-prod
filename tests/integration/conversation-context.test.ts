import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPool } from "@/lib/db";
import { ingestInboundMessage } from "@/lib/channels/inbox";
import { loadConversationContext } from "@/lib/agent/conversation-context";

const dbDescribe = process.env.PRONTO_RUN_DB_TESTS === "1" ? describe : describe.skip;
dbDescribe("conversation context follows the current durable job", () => {
  let clientId: string, channelId: string;
  beforeEach(async () => {
    clientId = randomUUID(); channelId = randomUUID();
    await getPool().query("insert into clients(id,name,slug,vertical,brand_voice) values($1,'Context fixture',$2,'test','Test')", [clientId, clientId]);
    await getPool().query("insert into channels(id,client_id,kind,name,status) values($1,$2,'telegram','Context fixture','active')", [channelId, clientId]);
  });
  afterEach(async () => { await getPool().query("delete from clients where id=$1", [clientId]); });
  afterAll(async () => { await getPool().end(); });
  const ingest = (text: string, thread = "context") => ingestInboundMessage({ channelId, channelKind: "telegram",
    externalMessageId: randomUUID(), externalThreadId: thread, customerHandle: "synthetic", text, raw: {} });

  it("excludes future messages despite equal or inverted timestamps and includes the preceding job's answer", async () => {
    const first = await ingest("Tell me about the vegetarian meal.");
    const current = await ingest("What about that option?");
    const future = await ingest("Ignore the prior enquiry and answer this later question.");
    await getPool().query("update messages set created_at='2026-01-01T00:00:00Z' where client_id=$1", [clientId]);
    await getPool().query("update messages set created_at='2000-01-01T00:00:00Z' where id=$1 and client_id=$2", [future.messageId, clientId]);
    const answer = await getPool().query<{id: string}>(`insert into messages(client_id,channel_id,conversation_id,external_message_id,sender_role,body,metadata)
      values($1,$2,$3,$4,'agent','Earlier job answer',$5::jsonb) returning id`,
      [clientId, channelId, current.conversationId, randomUUID(), JSON.stringify({ customerMessageId: first.messageId })]);
    const input = { clientId, conversationId: current.conversationId, customerMessageId: current.messageId };
    const ids = (await loadConversationContext(input)).map(message => message.id);
    expect(ids).toContain(first.messageId); expect(ids).toContain(answer.rows[0].id);
    expect(ids).not.toContain(current.messageId); expect(ids).not.toContain(future.messageId);
    const withCurrent = await loadConversationContext({ ...input, includeCurrent: true });
    expect(withCurrent.filter(message => message.id === current.messageId)).toHaveLength(1);
    expect(withCurrent.some(message => message.id === future.messageId)).toBe(false);
  });

  it("requires an anchor in the same tenant and conversation", async () => {
    const first = await ingest("First enquiry.");
    const other = await ingest("Other thread.", "other");
    expect(await loadConversationContext({ clientId, conversationId: first.conversationId, customerMessageId: other.messageId })).toEqual([]);
    expect(await loadConversationContext({ clientId: randomUUID(), conversationId: first.conversationId, customerMessageId: first.messageId })).toEqual([]);
  });
});
