import { query } from "@/lib/db";
import { decryptChannelList } from "@/lib/channels/credentials";
import type { Channel, Client, Conversation, Escalation, Message } from "@/lib/types";

export type OutboundDeliveryStatus = "pending" | "sending" | "sent" | "failed";

export type ClientMetricSummary = {
  activeClients: number;
  conversations: number;
  escalations: number;
  openEscalations: number;
  escalationRate: number;
  avgFirstResponseSeconds: number | null;
};

export type ConversationWithLastMessage = Conversation & {
  last_message: string | null;
  last_sender_role: string | null;
};

export type ClientConversationTriage = ConversationWithLastMessage & {
  channel_kind: Channel["kind"];
  active_escalation_id: string | null;
  active_escalation_status: Escalation["status"] | null;
  active_escalation_reason_code: string | null;
};

export type OperatorConversationTriage = ClientConversationTriage & {
  client_name: string;
};

export type EscalationWithContext = Escalation & {
  client_name: string;
  customer_message: string;
  customer_handle: string | null;
  channel_kind: Channel["kind"];
  owner_resolution_outbound_id: string | null;
  owner_resolution_outbound_status: OutboundDeliveryStatus | null;
  owner_resolution_outbound_error: string | null;
  owner_resolution_outbound_attempt_count: number | null;
  owner_resolution_outbound_sent_at: Date | null;
};

export type KnowledgeSourceSummary = {
  id: string;
  title: string;
  source_type: string;
  created_at: Date;
  chunk_count: string;
};

const actionableEscalationCondition = `
  (
    e.status <> 'resolved'
    or owner_reply.status in ('pending', 'sending', 'failed')
  )
`;

export async function getMetrics(clientId?: string): Promise<ClientMetricSummary> {
  const params = clientId ? [clientId] : [];
  const clientFilter = clientId ? "where id = $1" : "";
  const relationFilter = clientId ? "where client_id = $1" : "";

  const [clients, conversations, escalations, openEscalations] =
    await Promise.all([
      query<{ count: string }>(`select count(*) from clients ${clientFilter}`, params),
      query<{ count: string }>(
        `select count(*) from conversations ${relationFilter}`,
        params,
      ),
      query<{ count: string }>(`select count(*) from escalations ${relationFilter}`, params),
      query<{ count: string }>(
        `
          select count(*)
          from escalations e
          left join lateral (
            select status
            from outbound_messages
            where escalation_id = e.id
              and metadata->>'purpose' = 'escalation_resolution_reply'
            order by created_at desc
            limit 1
          ) owner_reply on true
          ${clientId ? "where e.client_id = $1 and" : "where"}
            ${actionableEscalationCondition}
        `,
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
  return decryptChannelList(result.rows);
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

export async function getClientConversationTriage(
  clientId: string,
  limit = 30,
): Promise<ClientConversationTriage[]> {
  const result = await query<ClientConversationTriage>(
    `
      select
        c.*,
        ch.kind as channel_kind,
        lm.body as last_message,
        lm.sender_role as last_sender_role,
        ae.id as active_escalation_id,
        ae.status as active_escalation_status,
        ae.reason_code as active_escalation_reason_code
      from conversations c
      join channels ch on ch.id = c.channel_id
      left join lateral (
        select body, sender_role
        from messages
        where conversation_id = c.id
        order by created_at desc
        limit 1
      ) lm on true
      left join lateral (
        select e.id, e.status, e.reason_code
        from escalations e
        left join lateral (
          select status
          from outbound_messages
          where escalation_id = e.id
            and metadata->>'purpose' = 'escalation_resolution_reply'
          order by created_at desc
          limit 1
        ) owner_reply on true
        where e.conversation_id = c.id
          and ${actionableEscalationCondition}
        order by e.created_at desc
        limit 1
      ) ae on true
      where c.client_id = $1
      order by c.last_message_at desc
      limit $2
    `,
    [clientId, limit],
  );
  return result.rows;
}

export async function getOperatorConversationTriage(
  limit = 50,
): Promise<OperatorConversationTriage[]> {
  const result = await query<OperatorConversationTriage>(
    `
      select
        c.*,
        cl.name as client_name,
        ch.kind as channel_kind,
        lm.body as last_message,
        lm.sender_role as last_sender_role,
        ae.id as active_escalation_id,
        ae.status as active_escalation_status,
        ae.reason_code as active_escalation_reason_code
      from conversations c
      join clients cl on cl.id = c.client_id
      join channels ch on ch.id = c.channel_id
      left join lateral (
        select body, sender_role
        from messages
        where conversation_id = c.id
        order by created_at desc
        limit 1
      ) lm on true
      left join lateral (
        select e.id, e.status, e.reason_code
        from escalations e
        left join lateral (
          select status
          from outbound_messages
          where escalation_id = e.id
            and metadata->>'purpose' = 'escalation_resolution_reply'
          order by created_at desc
          limit 1
        ) owner_reply on true
        where e.conversation_id = c.id
          and ${actionableEscalationCondition}
        order by e.created_at desc
        limit 1
      ) ae on true
      order by c.last_message_at desc
      limit $1
    `,
    [limit],
  );
  return result.rows;
}

export async function getConversationTriageDetail(input: {
  clientId: string;
  conversationId: string;
}): Promise<ClientConversationTriage | null> {
  const result = await query<ClientConversationTriage>(
    `
      select
        c.*,
        ch.kind as channel_kind,
        lm.body as last_message,
        lm.sender_role as last_sender_role,
        ae.id as active_escalation_id,
        ae.status as active_escalation_status,
        ae.reason_code as active_escalation_reason_code
      from conversations c
      join channels ch on ch.id = c.channel_id
      left join lateral (
        select body, sender_role
        from messages
        where conversation_id = c.id
        order by created_at desc
        limit 1
      ) lm on true
      left join lateral (
        select e.id, e.status, e.reason_code
        from escalations e
        left join lateral (
          select status
          from outbound_messages
          where escalation_id = e.id
            and metadata->>'purpose' = 'escalation_resolution_reply'
          order by created_at desc
          limit 1
        ) owner_reply on true
        where e.conversation_id = c.id
          and ${actionableEscalationCondition}
        order by e.created_at desc
        limit 1
      ) ae on true
      where c.client_id = $1 and c.id = $2
    `,
    [input.clientId, input.conversationId],
  );
  return result.rows[0] ?? null;
}

export async function getConversationMessages(
  conversationId: string,
  clientId?: string,
): Promise<Message[]> {
  const result = await query<Message>(
    clientId
      ? "select * from messages where conversation_id = $1 and client_id = $2 order by created_at asc"
      : "select * from messages where conversation_id = $1 order by created_at asc",
    clientId ? [conversationId, clientId] : [conversationId],
  );
  return result.rows;
}

export async function getOpenEscalations(
  input?: string | { clientId?: string; limit?: number; offset?: number },
): Promise<EscalationWithContext[]> {
  const clientId = typeof input === "string" ? input : input?.clientId;
  const limit = normalizeLimit(typeof input === "string" ? undefined : input?.limit, 20);
  const offset = normalizeOffset(typeof input === "string" ? undefined : input?.offset);
  const result = await query<EscalationWithContext>(
    `
      select
        e.*,
        cl.name as client_name,
        m.body as customer_message,
        c.customer_handle,
        ch.kind as channel_kind,
        owner_reply.id as owner_resolution_outbound_id,
        owner_reply.status as owner_resolution_outbound_status,
        owner_reply.last_error as owner_resolution_outbound_error,
        owner_reply.attempt_count as owner_resolution_outbound_attempt_count,
        owner_reply.sent_at as owner_resolution_outbound_sent_at
      from escalations e
      join clients cl on cl.id = e.client_id
      join conversations c on c.id = e.conversation_id
      join channels ch on ch.id = c.channel_id
      join messages m on m.id = e.message_id
      left join lateral (
        select id, status, last_error, attempt_count, sent_at
        from outbound_messages
        where escalation_id = e.id
          and metadata->>'purpose' = 'escalation_resolution_reply'
        order by created_at desc
        limit 1
      ) owner_reply on true
      ${clientId ? "where e.client_id = $1 and" : "where"}
        ${actionableEscalationCondition}
      order by e.created_at desc
      limit $${clientId ? 2 : 1}
      offset $${clientId ? 3 : 2}
    `,
    clientId ? [clientId, limit, offset] : [limit, offset],
  );
  return result.rows;
}

function normalizeLimit(value: number | undefined, fallback: number): number {
  if (!Number.isInteger(value) || !value || value < 1) {
    return fallback;
  }
  return Math.min(value, 100);
}

function normalizeOffset(value: number | undefined): number {
  if (!Number.isInteger(value) || value === undefined || value < 0) {
    return 0;
  }
  return value;
}

export async function getConversationActionableEscalation(input: {
  clientId: string;
  conversationId: string;
}): Promise<EscalationWithContext | null> {
  const result = await query<EscalationWithContext>(
    `
      select
        e.*,
        cl.name as client_name,
        m.body as customer_message,
        c.customer_handle,
        ch.kind as channel_kind,
        owner_reply.id as owner_resolution_outbound_id,
        owner_reply.status as owner_resolution_outbound_status,
        owner_reply.last_error as owner_resolution_outbound_error,
        owner_reply.attempt_count as owner_resolution_outbound_attempt_count,
        owner_reply.sent_at as owner_resolution_outbound_sent_at
      from escalations e
      join clients cl on cl.id = e.client_id
      join conversations c on c.id = e.conversation_id
      join channels ch on ch.id = c.channel_id
      join messages m on m.id = e.message_id
      left join lateral (
        select id, status, last_error, attempt_count, sent_at
        from outbound_messages
        where escalation_id = e.id
          and metadata->>'purpose' = 'escalation_resolution_reply'
        order by created_at desc
        limit 1
      ) owner_reply on true
      where e.client_id = $1
        and e.conversation_id = $2
        and ${actionableEscalationCondition}
      order by e.created_at desc
      limit 1
    `,
    [input.clientId, input.conversationId],
  );
  return result.rows[0] ?? null;
}

export async function getKnowledgeSources(
  clientId: string,
): Promise<KnowledgeSourceSummary[]> {
  const result = await query<KnowledgeSourceSummary>(
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
