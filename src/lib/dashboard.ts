import { query } from "@/lib/db";
import type { Channel, Client, Conversation, Escalation, Message } from "@/lib/types";

export type ClientMetricSummary = {
  activeClients: number;
  conversations: number;
  escalations: number;
  openEscalations: number;
  hallucinationIncidents: number;
  escalationRate: number;
  avgFirstResponseSeconds: number | null;
};

export type ConversationWithLastMessage = Conversation & {
  last_message: string | null;
  last_sender_role: string | null;
};

export type EscalationWithContext = Escalation & {
  client_name: string;
  customer_message: string;
  customer_handle: string | null;
  channel_kind: Channel["kind"];
};

export async function getMetrics(clientId?: string): Promise<ClientMetricSummary> {
  const params = clientId ? [clientId] : [];
  const clientFilter = clientId ? "where id = $1" : "";
  const relationFilter = clientId ? "where client_id = $1" : "";

  const [clients, conversations, escalations, openEscalations, hallucinations] =
    await Promise.all([
      query<{ count: string }>(`select count(*) from clients ${clientFilter}`, params),
      query<{ count: string }>(
        `select count(*) from conversations ${relationFilter}`,
        params,
      ),
      query<{ count: string }>(`select count(*) from escalations ${relationFilter}`, params),
      query<{ count: string }>(
        `select count(*) from escalations ${clientId ? "where client_id = $1 and" : "where"} status = 'open'`,
        params,
      ),
      query<{ count: string }>(
        `select count(*) from reviews ${clientId ? "where client_id = $1 and" : "where"} hallucination = true`,
        params,
      ),
    ]);

  const conversationCount = Number(conversations.rows[0].count);
  const escalationCount = Number(escalations.rows[0].count);

  return {
    activeClients: Number(clients.rows[0].count),
    conversations: conversationCount,
    escalations: escalationCount,
    openEscalations: Number(openEscalations.rows[0].count),
    hallucinationIncidents: Number(hallucinations.rows[0].count),
    escalationRate: conversationCount ? escalationCount / conversationCount : 0,
    avgFirstResponseSeconds: null,
  };
}

export async function getClients(): Promise<Client[]> {
  const result = await query<Client>("select * from clients order by created_at desc");
  return result.rows;
}

export async function getClient(clientId: string): Promise<Client | null> {
  const result = await query<Client>("select * from clients where id = $1", [clientId]);
  return result.rows[0] ?? null;
}

export async function getChannels(clientId: string): Promise<Channel[]> {
  const result = await query<Channel>(
    "select * from channels where client_id = $1 order by kind",
    [clientId],
  );
  return result.rows;
}

export async function getRecentConversations(
  clientId?: string,
  limit = 20,
): Promise<ConversationWithLastMessage[]> {
  const result = await query<ConversationWithLastMessage>(
    `
      select
        c.*,
        lm.body as last_message,
        lm.sender_role as last_sender_role
      from conversations c
      left join lateral (
        select body, sender_role
        from messages
        where conversation_id = c.id
        order by created_at desc
        limit 1
      ) lm on true
      ${clientId ? "where c.client_id = $1" : ""}
      order by c.last_message_at desc
      limit ${clientId ? "$2" : "$1"}
    `,
    clientId ? [clientId, limit] : [limit],
  );
  return result.rows;
}

export async function getConversationMessages(
  conversationId: string,
): Promise<Message[]> {
  const result = await query<Message>(
    "select * from messages where conversation_id = $1 order by created_at asc",
    [conversationId],
  );
  return result.rows;
}

export async function getOpenEscalations(
  clientId?: string,
): Promise<EscalationWithContext[]> {
  const result = await query<EscalationWithContext>(
    `
      select
        e.*,
        cl.name as client_name,
        m.body as customer_message,
        c.customer_handle,
        ch.kind as channel_kind
      from escalations e
      join clients cl on cl.id = e.client_id
      join conversations c on c.id = e.conversation_id
      join channels ch on ch.id = c.channel_id
      join messages m on m.id = e.message_id
      ${clientId ? "where e.client_id = $1 and" : "where"} e.status <> 'resolved'
      order by e.created_at desc
      limit 20
    `,
    clientId ? [clientId] : [],
  );
  return result.rows;
}

export async function getKnowledgeSources(clientId: string) {
  const result = await query<{
    id: string;
    title: string;
    source_type: string;
    created_at: Date;
    chunk_count: string;
  }>(
    `
      select
        ks.id,
        ks.title,
        ks.source_type,
        ks.created_at,
        count(kc.id) as chunk_count
      from knowledge_sources ks
      left join knowledge_chunks kc on kc.source_id = ks.id
      where ks.client_id = $1
      group by ks.id
      order by ks.created_at desc
    `,
    [clientId],
  );
  return result.rows;
}
