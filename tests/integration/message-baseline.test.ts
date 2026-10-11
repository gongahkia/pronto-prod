import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPool, vectorLiteral } from "@/lib/db";
import { processInboundMessage } from "@/lib/channels/process";
import { retrieveKnowledge } from "@/lib/knowledge/retrieve";
import { getKnowledgeSourceForClient } from "@/lib/knowledge/manage";
import { deterministicEmbedding } from "@/lib/llm/mock";
import { getPromptBrandVoiceProfile } from "@/lib/brand-voice";

const fakes = vi.hoisted(() => ({
  sendChannelText: vi.fn(async () => undefined),
  runAgentForMessage: vi.fn(async () => ({
    action: "answered" as const,
    responseText: "We open at 10 am.",
    reasonCode: "grounded_answer",
    reasonDetail: "Local baseline fixture.",
    confidence: 0.9,
    citedChunks: [],
    agentMessageId: "fixture-agent-message",
  })),
}));

vi.mock("@/lib/channels/dispatch", () => ({ sendChannelText: fakes.sendChannelText }));
vi.mock("@/lib/agent/engine", () => ({
  runAgentForMessage: fakes.runAgentForMessage,
  createEscalation: vi.fn(),
}));

const dbDescribe = process.env.PRONTO_RUN_DB_TESTS === "1" ? describe : describe.skip;

dbDescribe("isolated PostgreSQL message and retrieval baseline", () => {
  let clientA: string;
  let clientB: string;
  let channelA: string;
  let channelB: string;
  let sourceB: string;

  beforeEach(async () => {
    clientA = randomUUID();
    clientB = randomUUID();
    channelA = randomUUID();
    channelB = randomUUID();
    sourceB = randomUUID();
    fakes.sendChannelText.mockClear();
    fakes.runAgentForMessage.mockClear();
    const db = getPool();
    await db.query(
      `insert into clients (id, name, slug, vertical, brand_voice) values
       ($1, 'Tenant A', $2, 'test', 'A voice'),
       ($3, 'Tenant B', $4, 'test', 'B voice')`,
      [clientA, `test-a-${clientA}`, clientB, `test-b-${clientB}`],
    );
    await db.query(
      `insert into channels (id, client_id, kind, name, status) values
       ($1, $2, 'whatsapp', 'A WhatsApp', 'active'),
       ($3, $4, 'whatsapp', 'B WhatsApp', 'active')`,
      [channelA, clientA, channelB, clientB],
    );
    await db.query(
      `insert into knowledge_sources (id, client_id, title, source_type, content)
       values ($1, $2, 'Private hours', 'manual', 'Tenant B opens at midnight.')`,
      [sourceB, clientB],
    );
    await db.query(
      `insert into brand_voice_documents (client_id, title, content)
       values ($1, 'Private voice', 'Only tenant B says midnight.')`,
      [clientB],
    );
    await db.query(
      `insert into brand_voice_examples (client_id, customer_message, ideal_response)
       values ($1, 'When are you open?', 'We open at midnight.')`,
      [clientB],
    );
    const embedding = deterministicEmbedding("midnight hours");
    await db.query(
      `insert into knowledge_chunks
       (source_id, client_id, chunk_index, content, token_estimate, embedding, embedding_model, embedding_dimensions)
       values ($1, $2, 0, 'Tenant B opens at midnight.', 8, $3::vector, 'text-embedding-3-small', 1536)`,
      [sourceB, clientB, vectorLiteral(embedding)],
    );
  });

  afterEach(async () => {
    await getPool().query("delete from clients where id = any($1::uuid[])", [[clientA, clientB]]);
  });

  afterAll(async () => {
    await getPool().end();
  });

  it("identifies conversations per tenant/channel, persists inbound messages, and queues one reply", async () => {
    const input = (channelId: string, externalMessageId: string) => ({
      channelId,
      channelKind: "whatsapp" as const,
      externalMessageId,
      externalThreadId: "shared-customer-handle",
      customerHandle: "shared-customer-handle",
      text: "When do you open?",
      raw: { fixture: true },
    });
    const first = await processInboundMessage(input(channelA, "a-message"));
    const duplicate = await processInboundMessage(input(channelA, "a-message"));
    const otherTenant = await processInboundMessage(input(channelB, "b-message"));
    expect(first.duplicate).toBe(false);
    expect(duplicate.duplicate).toBe(true);
    expect(otherTenant.conversationId).not.toBe(first.conversationId);
    expect(fakes.runAgentForMessage).toHaveBeenCalledTimes(2);
    expect(fakes.sendChannelText).toHaveBeenCalledTimes(2);
    const db = getPool();
    const messages = await db.query<{ client_id: string; metadata: Record<string, unknown> }>(
      "select client_id, metadata from messages where external_message_id in ('a-message', 'b-message') order by external_message_id",
    );
    expect(messages.rows.map((row) => row.client_id)).toEqual([clientA, clientB]);
    expect(messages.rows[0].metadata).toMatchObject({ raw: { fixture: true } });
    const outbox = await db.query<{ client_id: string; status: string }>(
      "select client_id, status from outbound_messages where client_id = any($1::uuid[]) order by client_id",
      [[clientA, clientB]],
    );
    expect(outbox.rows).toHaveLength(2);
    expect(outbox.rows.every((row) => row.status === "sent")).toBe(true);
  });

  it("keeps another tenant's knowledge and brand voice out of supported reads", async () => {
    const embedding = deterministicEmbedding("midnight hours");
    const [aChunks, bChunks, aSource, bSource, aVoice, bVoice] = await Promise.all([
      retrieveKnowledge(clientA, embedding, 5, { queryText: "midnight hours", embeddingModel: "text-embedding-3-small" }),
      retrieveKnowledge(clientB, embedding, 5, { queryText: "midnight hours", embeddingModel: "text-embedding-3-small" }),
      getKnowledgeSourceForClient(sourceB, clientA),
      getKnowledgeSourceForClient(sourceB, clientB),
      getPromptBrandVoiceProfile(clientA),
      getPromptBrandVoiceProfile(clientB),
    ]);
    expect(aChunks).toEqual([]);
    expect(bChunks.some((chunk) => chunk.source_id === sourceB)).toBe(true);
    expect(aSource).toBeNull();
    expect(bSource?.client_id).toBe(clientB);
    expect(aVoice).toEqual({ document: null, examples: [] });
    expect(bVoice.document?.client_id).toBe(clientB);
    expect(bVoice.examples).toHaveLength(1);
    expect(bVoice.examples[0].client_id).toBe(clientB);
    const voices = await getPool().query<{ id: string; brand_voice: string }>(
      "select id, brand_voice from clients where id = any($1::uuid[])",
      [[clientA, clientB]],
    );
    expect(voices.rows.find((row) => row.id === clientA)?.brand_voice).toBe("A voice");
    expect(voices.rows.find((row) => row.id === clientB)?.brand_voice).toBe("B voice");
  });
});
