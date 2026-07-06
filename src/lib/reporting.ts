import { query } from "@/lib/db";
import { channelKinds } from "@/lib/channels/catalog";
import type { Channel, ConversationStatus, EscalationStatus } from "@/lib/types";

export type ConversationFilterInput = {
  clientId?: string;
  query?: string;
  channelKind?: string;
  status?: string;
  reasonCode?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

export type FilteredConversation = {
  id: string;
  client_id: string;
  client_name: string;
  channel_kind: Channel["kind"];
  customer_name: string | null;
  customer_handle: string | null;
  status: ConversationStatus;
  last_message_at: Date;
  created_at: Date;
  last_message: string | null;
  last_sender_role: string | null;
  active_escalation_id: string | null;
  active_escalation_status: EscalationStatus | null;
  active_escalation_reason_code: string | null;
};

export type ClientDashboardAnalytics = {
  conversationCount: number;
  escalatedConversationCount: number;
  escalationRate: number;
  actionableEscalations: number;
  avgFirstResponseSeconds: number | null;
  csatAverage: number | null;
  csatResponses: number;
  knowledgeGapCount: number;
};

export type KnowledgeGapRow = {
  conversation_id: string;
  client_id: string;
  client_name: string;
  customer_name: string | null;
  customer_handle: string | null;
  channel_kind: Channel["kind"];
  last_message_at: Date;
  gap_source: string;
  reason_code: string | null;
  last_message: string | null;
};

export type OperatorClientHealth = {
  clientId: string;
  name: string;
  vertical: string;
  planTier: string;
  status: string;
  health: "critical" | "warning" | "healthy";
  activeChannels: number;
  degradedChannels: number;
  openTriage: number;
  assistantRequests: number;
  knowledgeSources: number;
  latestActivityAt: Date | null;
};

export type OperatorCommandCenter = {
  needsActionNow: number;
  channelIssues: number;
  degradedClients: number;
  setupNeeds: number;
  clientHealth: OperatorClientHealth[];
};

type SqlFilter = {
  where: string[];
  values: unknown[];
};

const channelKindSet = new Set(channelKinds);
const conversationStatuses = new Set(["active", "escalated", "closed"]);

const actionableEscalationCondition = `
  (
    e.status <> 'resolved'
    or owner_reply.status in ('pending', 'sending', 'failed')
  )
`;

export async function getFilteredConversations(
  input: ConversationFilterInput = {},
): Promise<FilteredConversation[]> {
  const filters = buildConversationFilters(input);
  const limit = normalizeLimit(input.limit, 50);
  const offset = normalizeOffset(input.offset);
  const result = await query<FilteredConversation>(
    `
      select
        c.id,
        c.client_id,
        cl.name as client_name,
        ch.kind as channel_kind,
        c.customer_name,
        c.customer_handle,
        c.status,
        c.last_message_at,
        c.created_at,
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
      ${filters.where.length ? `where ${filters.where.join(" and ")}` : ""}
      order by c.last_message_at desc
      limit $${filters.values.length + 1}
      offset $${filters.values.length + 2}
    `,
    [...filters.values, limit, offset],
  );
  return result.rows;
}

export async function getClientDashboardAnalytics(
  clientId: string,
): Promise<ClientDashboardAnalytics> {
  const [conversationStats, actionable, firstResponse, csat, gaps] =
    await Promise.all([
      query<{
        conversations: string;
        escalated: string;
      }>(
        `
          select
            count(*) as conversations,
            count(*) filter (where status = 'escalated') as escalated
          from conversations
          where client_id = $1
        `,
        [clientId],
      ),
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
          where e.client_id = $1
            and ${actionableEscalationCondition}
        `,
        [clientId],
      ),
      query<{ seconds: string | null }>(
        `
          select avg(extract(epoch from (first_response.created_at - customer.created_at)))::text as seconds
          from messages customer
          join lateral (
            select created_at
            from messages
            where conversation_id = customer.conversation_id
              and sender_role in ('agent', 'operator')
              and created_at > customer.created_at
            order by created_at asc
            limit 1
          ) first_response on true
          where customer.client_id = $1 and customer.sender_role = 'customer'
        `,
        [clientId],
      ),
      query<{ average: string | null; count: string }>(
        `
          select avg(score)::text as average, count(*) as count
          from csat_responses
          where client_id = $1
        `,
        [clientId],
      ),
      getKnowledgeGapReport({ clientId, limit: 50 }),
    ]);

  const row = conversationStats.rows[0];
  const conversationCount = Number(row.conversations);
  const escalatedConversationCount = Number(row.escalated);

  return {
    conversationCount,
    escalatedConversationCount,
    escalationRate: conversationCount
      ? escalatedConversationCount / conversationCount
      : 0,
    actionableEscalations: Number(actionable.rows[0].count),
    avgFirstResponseSeconds: parseNullableNumber(firstResponse.rows[0]?.seconds),
    csatAverage: parseNullableNumber(csat.rows[0]?.average),
    csatResponses: Number(csat.rows[0]?.count ?? 0),
    knowledgeGapCount: gaps.length,
  };
}

export async function getKnowledgeGapReport(input: {
  clientId?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<KnowledgeGapRow[]> {
  const params: unknown[] = [];
  const clientFilter = input.clientId ? `and c.client_id = $${pushParam(params, input.clientId)}` : "";
  const limit = normalizeLimit(input.limit, 20);
  const offset = normalizeOffset(input.offset);
  const result = await query<KnowledgeGapRow>(
    `
      with gap_candidates as (
        select
          c.id as conversation_id,
          c.client_id,
          cl.name as client_name,
          c.customer_name,
          c.customer_handle,
          ch.kind as channel_kind,
          c.last_message_at,
          'escalation' as gap_source,
          e.reason_code,
          lm.body as last_message
        from conversations c
        join clients cl on cl.id = c.client_id
        join channels ch on ch.id = c.channel_id
        join lateral (
          select reason_code
          from escalations
          where conversation_id = c.id
            and reason_code in ('low_retrieval_confidence', 'out_of_scope')
          order by created_at desc
          limit 1
        ) e on true
        left join lateral (
          select body
          from messages
          where conversation_id = c.id
          order by created_at desc
          limit 1
        ) lm on true
        where true
        ${clientFilter}
      )
      select *
      from gap_candidates
      order by last_message_at desc
      limit $${params.length + 1}
      offset $${params.length + 2}
    `,
    [...params, limit, offset],
  );
  return result.rows;
}

export async function getOperatorCommandCenter(): Promise<OperatorCommandCenter> {
  const clientHealth = await query<{
    client_id: string;
    name: string;
    vertical: string;
    plan_tier: string;
    status: string;
    active_channels: string;
    degraded_channels: string;
    open_triage: string;
    assistant_requests: string;
    knowledge_sources: string;
    latest_activity_at: Date | null;
  }>(
    `
      with actionable as (
        select e.id, e.client_id
        from escalations e
        left join lateral (
          select status
          from outbound_messages
          where escalation_id = e.id
            and metadata->>'purpose' = 'escalation_resolution_reply'
          order by created_at desc
          limit 1
        ) owner_reply on true
        where ${actionableEscalationCondition}
      ),
      open_requests as (
        select id, client_id
        from client_assistant_change_requests
        where status in ('open', 'reviewing')
      )
      select
        cl.id as client_id,
        cl.name,
        cl.vertical,
        cl.plan_tier,
        cl.status,
        count(distinct ch.id) filter (where ch.status = 'active')::text as active_channels,
        count(distinct ch.id) filter (where ch.last_health_status in ('degraded', 'unconfigured'))::text as degraded_channels,
        count(distinct a.id)::text as open_triage,
        count(distinct req.id)::text as assistant_requests,
        count(distinct ks.id)::text as knowledge_sources,
        max(c.last_message_at) as latest_activity_at
      from clients cl
      left join channels ch on ch.client_id = cl.id
      left join actionable a on a.client_id = cl.id
      left join open_requests req on req.client_id = cl.id
      left join knowledge_sources ks on ks.client_id = cl.id
      left join conversations c on c.client_id = cl.id
      group by cl.id, cl.name, cl.vertical, cl.plan_tier, cl.status
      order by
        count(distinct ch.id) filter (where ch.last_health_status in ('degraded', 'unconfigured')) desc,
        count(distinct a.id) desc,
        max(c.last_message_at) desc nulls last,
        cl.created_at desc
    `,
  );

  const health = clientHealth.rows.map((row): OperatorClientHealth => {
    const degradedChannels = Number(row.degraded_channels);
    const activeChannels = Number(row.active_channels);
    const openTriage = Number(row.open_triage);
    const assistantRequests = Number(row.assistant_requests);
    const knowledgeSources = Number(row.knowledge_sources);
    const healthStatus =
      degradedChannels > 0
        ? "critical"
        : row.status !== "live" ||
            activeChannels === 0 ||
            knowledgeSources === 0 ||
            openTriage > 0 ||
            assistantRequests > 0
          ? "warning"
          : "healthy";

    return {
      clientId: row.client_id,
      name: row.name,
      vertical: row.vertical,
      planTier: row.plan_tier,
      status: row.status,
      health: healthStatus,
      activeChannels,
      degradedChannels,
      openTriage,
      assistantRequests,
      knowledgeSources,
      latestActivityAt: row.latest_activity_at,
    };
  });

  const openTriageCount = health.reduce((sum, row) => sum + row.openTriage, 0);
  const channelIssueCount = health.reduce((sum, row) => sum + row.degradedChannels, 0);
  const assistantRequestCount = health.reduce((sum, row) => sum + row.assistantRequests, 0);
  const degradedClientCount = health.filter((row) => row.health === "critical").length;
  const setupNeedCount = health.filter(
    (row) => row.status !== "live" || row.activeChannels === 0 || row.knowledgeSources === 0,
  ).length;

  return {
    needsActionNow: openTriageCount + channelIssueCount + assistantRequestCount,
    channelIssues: channelIssueCount,
    degradedClients: degradedClientCount,
    setupNeeds: setupNeedCount,
    clientHealth: health,
  };
}

function buildConversationFilters(input: ConversationFilterInput): SqlFilter {
  const where: string[] = [];
  const values: unknown[] = [];

  if (input.clientId) {
    where.push(`c.client_id = $${pushParam(values, input.clientId)}`);
  }
  if (input.query?.trim()) {
    const value = `%${input.query.trim()}%`;
    const param = pushParam(values, value);
    where.push(`(
      c.customer_name ilike $${param}
      or c.customer_handle ilike $${param}
      or lm.body ilike $${param}
    )`);
  }
  if (input.channelKind && channelKindSet.has(input.channelKind as Channel["kind"])) {
    where.push(`ch.kind = $${pushParam(values, input.channelKind)}::channel_kind`);
  }
  if (input.status && conversationStatuses.has(input.status)) {
    where.push(`c.status = $${pushParam(values, input.status)}::conversation_status`);
  }
  if (input.reasonCode?.trim()) {
    where.push(`ae.reason_code = $${pushParam(values, input.reasonCode.trim())}`);
  }
  if (isDateInput(input.from)) {
    where.push(`c.last_message_at >= $${pushParam(values, input.from)}::timestamptz`);
  }
  if (isDateInput(input.to)) {
    where.push(
      `c.last_message_at < ($${pushParam(values, input.to)}::date + interval '1 day')`,
    );
  }

  return { where, values };
}

function pushParam(values: unknown[], value: unknown): number {
  values.push(value);
  return values.length;
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

function parseNullableNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isDateInput(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}
