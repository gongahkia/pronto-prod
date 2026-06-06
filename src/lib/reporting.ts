import { query } from "@/lib/db";
import type { Channel, ConversationStatus, EscalationStatus } from "@/lib/types";

export type ConversationFilterInput = {
  clientId?: string;
  query?: string;
  channelKind?: string;
  status?: string;
  reasonCode?: string;
  reviewLabel?: string;
  from?: string;
  to?: string;
  limit?: number;
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
  latest_review_label: string | null;
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
  review_label: string | null;
  last_message: string | null;
};

export type SlaSummary = {
  clientId?: string;
  trackedOpenItems: number;
  breachedItems: number;
  soonItems: number;
  targetHours: number | null;
  oldestOpenSeconds: number | null;
};

export type OperationalAlert = {
  id: string;
  severity: "critical" | "warning";
  title: string;
  detail: string;
  href: string;
};

export type OperatorActionQueueItem = {
  id: string;
  severity: "critical" | "warning";
  kind: "sla" | "outbound" | "channel" | "knowledge" | "quality";
  title: string;
  detail: string;
  clientId: string;
  clientName: string;
  href: string;
  occurredAt: Date | null;
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
  slaBreaches: number;
  failedSends: number;
  knowledgeSources: number;
  latestActivityAt: Date | null;
};

export type OperatorCommandCenter = {
  needsActionNow: number;
  slaBreaches: number;
  failedSends: number;
  degradedClients: number;
  launchBlockers: number;
  qualityBlockers: number;
  actionQueue: OperatorActionQueueItem[];
  clientHealth: OperatorClientHealth[];
};

type SqlFilter = {
  where: string[];
  values: unknown[];
};

const channelKinds = new Set(["whatsapp", "telegram", "console"]);
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
        ae.reason_code as active_escalation_reason_code,
        lr.answer_label as latest_review_label
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
      left join lateral (
        select answer_label
        from reviews
        where conversation_id = c.id
        order by created_at desc
        limit 1
      ) lr on true
      ${filters.where.length ? `where ${filters.where.join(" and ")}` : ""}
      order by c.last_message_at desc
      limit $${filters.values.length + 1}
    `,
    [...filters.values, limit],
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
} = {}): Promise<KnowledgeGapRow[]> {
  const params: unknown[] = [];
  const clientFilter = input.clientId ? `and c.client_id = $${pushParam(params, input.clientId)}` : "";
  const limit = normalizeLimit(input.limit, 20);
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
          case
            when r.knowledge_update_needed = true
              or r.answer_label = 'needs_knowledge_update'
              then 'review'
            when e.reason_code in ('low_retrieval_confidence', 'out_of_scope')
              then 'escalation'
            else 'unknown'
          end as gap_source,
          e.reason_code,
          r.answer_label as review_label,
          lm.body as last_message
        from conversations c
        join clients cl on cl.id = c.client_id
        join channels ch on ch.id = c.channel_id
        left join lateral (
          select answer_label, knowledge_update_needed
          from reviews
          where conversation_id = c.id
          order by created_at desc
          limit 1
        ) r on true
        left join lateral (
          select reason_code
          from escalations
          where conversation_id = c.id
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
        where (
          r.knowledge_update_needed = true
          or r.answer_label = 'needs_knowledge_update'
          or e.reason_code in ('low_retrieval_confidence', 'out_of_scope')
        )
        ${clientFilter}
      )
      select *
      from gap_candidates
      order by last_message_at desc
      limit $${params.length + 1}
    `,
    [...params, limit],
  );
  return result.rows;
}

export async function getSlaSummary(clientId?: string): Promise<SlaSummary> {
  const params = clientId ? [clientId] : [];
  const result = await query<{
    tracked: string;
    breached: string;
    soon: string;
    target_hours: string | null;
    oldest_seconds: string | null;
  }>(
    `
      with open_items as (
        select
          e.id,
          e.client_id,
          case
            when lower(cl.plan_tier) = 'scale' then 1
            when lower(cl.plan_tier) = 'growth' then 4
            else 24
          end as target_hours,
          extract(epoch from (now() - e.created_at)) as age_seconds
        from escalations e
        join clients cl on cl.id = e.client_id
        left join lateral (
          select status
          from outbound_messages
          where escalation_id = e.id
            and metadata->>'purpose' = 'escalation_resolution_reply'
          order by created_at desc
          limit 1
        ) owner_reply on true
        where ${clientId ? "e.client_id = $1 and" : ""}
          ${actionableEscalationCondition}
      )
      select
        count(*) as tracked,
        count(*) filter (where age_seconds >= target_hours * 3600) as breached,
        count(*) filter (
          where age_seconds >= target_hours * 3600 * 0.75
            and age_seconds < target_hours * 3600
        ) as soon,
        min(target_hours)::text as target_hours,
        max(age_seconds)::text as oldest_seconds
      from open_items
    `,
    params,
  );
  const row = result.rows[0];
  return {
    clientId,
    trackedOpenItems: Number(row.tracked),
    breachedItems: Number(row.breached),
    soonItems: Number(row.soon),
    targetHours: row.target_hours ? Number(row.target_hours) : null,
    oldestOpenSeconds: parseNullableNumber(row.oldest_seconds),
  };
}

export async function getOperationalAlerts(input: {
  clientId?: string;
  limit?: number;
} = {}): Promise<OperationalAlert[]> {
  const [failedOutbound, unhealthyChannels, staleRefreshes, blockers] =
    await Promise.all([
      query<{
        id: string;
        client_id: string;
        client_name: string;
        conversation_id: string | null;
        last_error: string | null;
      }>(
        `
          select
            om.id,
            om.client_id,
            cl.name as client_name,
            om.conversation_id,
            om.last_error
          from outbound_messages om
          join clients cl on cl.id = om.client_id
          where om.status = 'failed'
            ${input.clientId ? "and om.client_id = $1" : ""}
          order by om.updated_at desc
          limit 10
        `,
        input.clientId ? [input.clientId] : [],
      ),
      query<{
        id: string;
        client_id: string;
        client_name: string;
        kind: string;
        last_health_error: string | null;
      }>(
        `
          select
            ch.id,
            ch.client_id,
            cl.name as client_name,
            ch.kind::text,
            ch.last_health_error
          from channels ch
          join clients cl on cl.id = ch.client_id
          where ch.last_health_status in ('degraded', 'unconfigured')
            ${input.clientId ? "and ch.client_id = $1" : ""}
          order by ch.last_health_check_at desc nulls last
          limit 10
        `,
        input.clientId ? [input.clientId] : [],
      ),
      query<{
        id: string;
        client_id: string;
        client_name: string;
        notes: string | null;
      }>(
        `
          select
            krr.id,
            krr.client_id,
            cl.name as client_name,
            krr.notes
          from knowledge_refresh_requests krr
          join clients cl on cl.id = krr.client_id
          where krr.status = 'open'
            and krr.due_at < now()
            ${input.clientId ? "and krr.client_id = $1" : ""}
          order by krr.due_at asc
          limit 10
        `,
        input.clientId ? [input.clientId] : [],
      ),
      query<{
        id: string;
        client_id: string;
        client_name: string;
        conversation_id: string;
        answer_label: string | null;
      }>(
        `
          select
            r.id,
            r.client_id,
            cl.name as client_name,
            r.conversation_id,
            r.answer_label
          from reviews r
          join clients cl on cl.id = r.client_id
          where (r.hallucination = true or r.pilot_blocker = true)
            ${input.clientId ? "and r.client_id = $1" : ""}
          order by r.created_at desc
          limit 10
        `,
        input.clientId ? [input.clientId] : [],
      ),
    ]);

  const alerts: OperationalAlert[] = [
    ...failedOutbound.rows.map((row) => ({
      id: `outbound:${row.id}`,
      severity: "critical" as const,
      title: "Outbound send failed",
      detail: `${row.client_name}: ${row.last_error ?? "retry required"}`,
      href: row.conversation_id
        ? conversationHref(row.client_id, row.conversation_id)
        : `/operator/clients/${row.client_id}/channels`,
    })),
    ...unhealthyChannels.rows.map((row) => ({
      id: `channel:${row.id}`,
      severity: "warning" as const,
      title: "Channel health failed",
      detail: `${row.client_name} ${row.kind}: ${row.last_health_error ?? "check channel setup"}`,
      href: `/operator/clients/${row.client_id}/channels`,
    })),
    ...staleRefreshes.rows.map((row) => ({
      id: `refresh:${row.id}`,
      severity: "warning" as const,
      title: "Knowledge refresh overdue",
      detail: `${row.client_name}: ${row.notes ?? "review client source material"}`,
      href: `/operator/clients/${row.client_id}/knowledge`,
    })),
    ...blockers.rows.map((row) => ({
      id: `review:${row.id}`,
      severity: "critical" as const,
      title: "Quality blocker logged",
      detail: `${row.client_name}: ${row.answer_label ?? "hallucination or pilot blocker"}`,
      href: conversationHref(row.client_id, row.conversation_id),
    })),
  ];

  return alerts.slice(0, normalizeLimit(input.limit, 12));
}

export async function getOperatorCommandCenter(): Promise<OperatorCommandCenter> {
  const [failedOutbound, escalations, unhealthyChannels, overdueRefreshes, qualityBlockers, clientHealth, actionCounts] =
    await Promise.all([
      query<{
        id: string;
        client_id: string;
        client_name: string;
        conversation_id: string | null;
        last_error: string | null;
        updated_at: Date;
      }>(
        `
          select
            om.id,
            om.client_id,
            cl.name as client_name,
            om.conversation_id,
            om.last_error,
            om.updated_at
          from outbound_messages om
          join clients cl on cl.id = om.client_id
          where om.status = 'failed'
          order by om.updated_at desc
          limit 20
        `,
      ),
      query<{
        id: string;
        client_id: string;
        client_name: string;
        conversation_id: string;
        reason_code: string;
        reason_detail: string;
        status: EscalationStatus;
        created_at: Date;
        target_hours: string;
        age_seconds: string;
      }>(
        `
          select
            e.id,
            e.client_id,
            cl.name as client_name,
            e.conversation_id,
            e.reason_code,
            e.reason_detail,
            e.status,
            e.created_at,
            case
              when lower(cl.plan_tier) = 'scale' then 1
              when lower(cl.plan_tier) = 'growth' then 4
              else 24
            end::text as target_hours,
            extract(epoch from (now() - e.created_at))::text as age_seconds
          from escalations e
          join clients cl on cl.id = e.client_id
          left join lateral (
            select status
            from outbound_messages
            where escalation_id = e.id
              and metadata->>'purpose' = 'escalation_resolution_reply'
            order by created_at desc
            limit 1
          ) owner_reply on true
          where ${actionableEscalationCondition}
          order by e.created_at asc
          limit 30
        `,
      ),
      query<{
        id: string;
        client_id: string;
        client_name: string;
        kind: string;
        last_health_error: string | null;
        last_health_check_at: Date | null;
      }>(
        `
          select
            ch.id,
            ch.client_id,
            cl.name as client_name,
            ch.kind::text,
            ch.last_health_error,
            ch.last_health_check_at
          from channels ch
          join clients cl on cl.id = ch.client_id
          where ch.last_health_status in ('degraded', 'unconfigured')
          order by ch.last_health_check_at desc nulls last
          limit 20
        `,
      ),
      query<{
        id: string;
        client_id: string;
        client_name: string;
        notes: string | null;
        due_at: Date;
      }>(
        `
          select
            krr.id,
            krr.client_id,
            cl.name as client_name,
            krr.notes,
            krr.due_at
          from knowledge_refresh_requests krr
          join clients cl on cl.id = krr.client_id
          where krr.status = 'open'
            and krr.due_at < now()
          order by krr.due_at asc
          limit 20
        `,
      ),
      query<{
        id: string;
        client_id: string;
        client_name: string;
        conversation_id: string;
        answer_label: string | null;
        created_at: Date;
      }>(
        `
          select
            r.id,
            r.client_id,
            cl.name as client_name,
            r.conversation_id,
            r.answer_label,
            r.created_at
          from reviews r
          join clients cl on cl.id = r.client_id
          where r.hallucination = true or r.pilot_blocker = true
          order by r.created_at desc
          limit 20
        `,
      ),
      query<{
        client_id: string;
        name: string;
        vertical: string;
        plan_tier: string;
        status: string;
        active_channels: string;
        degraded_channels: string;
        open_triage: string;
        sla_breaches: string;
        failed_sends: string;
        knowledge_sources: string;
        latest_activity_at: Date | null;
      }>(
        `
          with actionable as (
            select
              e.id,
              e.client_id,
              case
                when lower(cl.plan_tier) = 'scale' then 1
                when lower(cl.plan_tier) = 'growth' then 4
                else 24
              end as target_hours,
              extract(epoch from (now() - e.created_at)) as age_seconds
            from escalations e
            join clients cl on cl.id = e.client_id
            left join lateral (
              select status
              from outbound_messages
              where escalation_id = e.id
                and metadata->>'purpose' = 'escalation_resolution_reply'
              order by created_at desc
              limit 1
            ) owner_reply on true
            where ${actionableEscalationCondition}
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
            count(distinct a.id) filter (where a.age_seconds >= a.target_hours * 3600)::text as sla_breaches,
            count(distinct om.id) filter (where om.status = 'failed')::text as failed_sends,
            count(distinct ks.id)::text as knowledge_sources,
            max(c.last_message_at) as latest_activity_at
          from clients cl
          left join channels ch on ch.client_id = cl.id
          left join actionable a on a.client_id = cl.id
          left join outbound_messages om on om.client_id = cl.id
          left join knowledge_sources ks on ks.client_id = cl.id
          left join conversations c on c.client_id = cl.id
          group by cl.id, cl.name, cl.vertical, cl.plan_tier, cl.status
          order by
            count(distinct a.id) filter (where a.age_seconds >= a.target_hours * 3600) desc,
            count(distinct ch.id) filter (where ch.last_health_status in ('degraded', 'unconfigured')) desc,
            max(c.last_message_at) desc nulls last,
            cl.created_at desc
        `,
      ),
      query<{
        failed_sends: string;
        actionable_escalations: string;
        unhealthy_channels: string;
        overdue_refreshes: string;
        quality_blockers: string;
      }>(
        `
          select
            (select count(*) from outbound_messages where status = 'failed')::text as failed_sends,
            (
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
              where ${actionableEscalationCondition}
            )::text as actionable_escalations,
            (
              select count(*)
              from channels
              where last_health_status in ('degraded', 'unconfigured')
            )::text as unhealthy_channels,
            (
              select count(*)
              from knowledge_refresh_requests
              where status = 'open'
                and due_at < now()
            )::text as overdue_refreshes,
            (
              select count(*)
              from reviews
              where hallucination = true or pilot_blocker = true
            )::text as quality_blockers
        `,
      ),
    ]);

  const actionQueue: OperatorActionQueueItem[] = [
    ...failedOutbound.rows.map((row) => ({
      id: `outbound:${row.id}`,
      severity: "critical" as const,
      kind: "outbound" as const,
      title: "Outbound send failed",
      detail: row.last_error ?? "Retry required",
      clientId: row.client_id,
      clientName: row.client_name,
      href: row.conversation_id
        ? conversationHref(row.client_id, row.conversation_id)
        : `/operator/clients/${row.client_id}/channels`,
      occurredAt: row.updated_at,
    })),
    ...escalations.rows.map((row) => {
      const breached = Number(row.age_seconds) >= Number(row.target_hours) * 3600;
      return {
        id: `sla:${row.id}`,
        severity: breached ? "critical" as const : "warning" as const,
        kind: "sla" as const,
        title: breached ? "SLA breach" : `${row.status} triage item`,
        detail: `${row.reason_code}: ${row.reason_detail}`,
        clientId: row.client_id,
        clientName: row.client_name,
        href: conversationHref(row.client_id, row.conversation_id),
        occurredAt: row.created_at,
      };
    }),
    ...unhealthyChannels.rows.map((row) => ({
      id: `channel:${row.id}`,
      severity: "warning" as const,
      kind: "channel" as const,
      title: "Channel degraded",
      detail: `${row.kind}: ${row.last_health_error ?? "check channel setup"}`,
      clientId: row.client_id,
      clientName: row.client_name,
      href: `/operator/clients/${row.client_id}/channels`,
      occurredAt: row.last_health_check_at,
    })),
    ...overdueRefreshes.rows.map((row) => ({
      id: `refresh:${row.id}`,
      severity: "warning" as const,
      kind: "knowledge" as const,
      title: "Knowledge refresh overdue",
      detail: row.notes ?? "Review client source material",
      clientId: row.client_id,
      clientName: row.client_name,
      href: `/operator/clients/${row.client_id}/knowledge`,
      occurredAt: row.due_at,
    })),
    ...qualityBlockers.rows.map((row) => ({
      id: `quality:${row.id}`,
      severity: "critical" as const,
      kind: "quality" as const,
      title: "Quality blocker",
      detail: row.answer_label ?? "Hallucination or pilot blocker",
      clientId: row.client_id,
      clientName: row.client_name,
      href: conversationHref(row.client_id, row.conversation_id),
      occurredAt: row.created_at,
    })),
  ]
    .sort((a, b) => {
      const severityDelta = severityRank(b.severity) - severityRank(a.severity);
      if (severityDelta !== 0) {
        return severityDelta;
      }
      return dateValue(b.occurredAt) - dateValue(a.occurredAt);
    });

  const health = clientHealth.rows.map((row): OperatorClientHealth => {
    const degradedChannels = Number(row.degraded_channels);
    const slaBreaches = Number(row.sla_breaches);
    const failedSends = Number(row.failed_sends);
    const activeChannels = Number(row.active_channels);
    const knowledgeSources = Number(row.knowledge_sources);
    const healthStatus =
      slaBreaches > 0 || failedSends > 0 || degradedChannels > 0
        ? "critical"
        : row.status !== "live" || activeChannels === 0 || knowledgeSources === 0
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
      openTriage: Number(row.open_triage),
      slaBreaches,
      failedSends,
      knowledgeSources,
      latestActivityAt: row.latest_activity_at,
    };
  });

  const slaBreachCount = health.reduce((sum, row) => sum + row.slaBreaches, 0);
  const counts = actionCounts.rows[0];
  const failedSendCount = Number(counts.failed_sends);
  const actionableEscalationCount = Number(counts.actionable_escalations);
  const unhealthyChannelCount = Number(counts.unhealthy_channels);
  const overdueRefreshCount = Number(counts.overdue_refreshes);
  const degradedClientCount = health.filter((row) => row.degradedChannels > 0).length;
  const launchBlockerCount = health.filter(
    (row) => row.status !== "live" || row.activeChannels === 0 || row.knowledgeSources === 0,
  ).length;
  const qualityBlockerCount = Number(counts.quality_blockers);

  return {
    needsActionNow:
      failedSendCount +
      actionableEscalationCount +
      unhealthyChannelCount +
      overdueRefreshCount +
      qualityBlockerCount,
    slaBreaches: slaBreachCount,
    failedSends: failedSendCount,
    degradedClients: degradedClientCount,
    launchBlockers: launchBlockerCount,
    qualityBlockers: qualityBlockerCount,
    actionQueue,
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
  if (input.channelKind && channelKinds.has(input.channelKind)) {
    where.push(`ch.kind = $${pushParam(values, input.channelKind)}::channel_kind`);
  }
  if (input.status && conversationStatuses.has(input.status)) {
    where.push(`c.status = $${pushParam(values, input.status)}::conversation_status`);
  }
  if (input.reasonCode?.trim()) {
    where.push(`ae.reason_code = $${pushParam(values, input.reasonCode.trim())}`);
  }
  if (input.reviewLabel?.trim()) {
    where.push(`lr.answer_label = $${pushParam(values, input.reviewLabel.trim())}`);
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

function parseNullableNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function severityRank(severity: OperatorActionQueueItem["severity"]): number {
  return severity === "critical" ? 2 : 1;
}

function dateValue(value: Date | null): number {
  return value ? value.getTime() : 0;
}

function isDateInput(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function conversationHref(clientId: string, conversationId: string): string {
  return `/operator/clients/${clientId}/conversations/${conversationId}`;
}
