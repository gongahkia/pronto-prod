import { query } from "@/lib/db";
import type { ChannelKind, ChannelStatus } from "@/lib/types";

export type BusinessChannelOverview = { id: string; kind: ChannelKind; name: string;
  status: ChannelStatus; last_health_status: string | null; has_secure_configuration: boolean };

export async function getBusinessChannelOverview(clientId: string): Promise<BusinessChannelOverview[]> {
  const result = await query<BusinessChannelOverview>(
    `select id, kind, name, status, last_health_status,
       encrypted_credentials is not null as has_secure_configuration
     from channels where client_id = $1 order by kind`, [clientId]);
  return result.rows;
}

export type AttentionItem = {
  escalation_id: string; conversation_id: string; created_at: Date; age_minutes: number;
  status: "open" | "claimed"; conversation_status: string;
  customer_name: string | null; customer_handle: string | null;
  channel_kind: string; assigned_name: string | null;
  notification_status: string | null; reason_code: string;
};

export async function getBusinessAttention(clientId: string): Promise<AttentionItem[]> {
  const result = await query<AttentionItem>(
    `select e.id as escalation_id, e.conversation_id, e.created_at, e.status,
       greatest(0, floor(extract(epoch from (now() - e.created_at)) / 60))::int as age_minutes,
       c.status as conversation_status, c.customer_name, c.customer_handle,
       ch.kind as channel_kind, u.name as assigned_name, n.status as notification_status,
       e.reason_code
     from escalations e join conversations c on c.id = e.conversation_id and c.client_id = e.client_id
     join channels ch on ch.id = c.channel_id and ch.client_id = e.client_id
     left join users u on u.id = e.assigned_to_user_id and u.client_id = e.client_id
     left join staff_notification_jobs n on n.escalation_id = e.id and n.client_id = e.client_id
     where e.client_id = $1 and e.status in ('open', 'claimed')
     order by e.created_at asc limit 100`, [clientId]);
  return result.rows;
}

export type BusinessActivity = {
  id: string; conversation_id: string; occurred_at: Date; channel_kind: string;
  customer_name: string | null; customer_handle: string | null;
  conversation_status: string; outbound_status: string | null;
  provider_status: string | null; outbound_purpose: string | null; is_local_demo: boolean;
};

export async function getBusinessActivity(clientId: string): Promise<BusinessActivity[]> {
  const result = await query<BusinessActivity>(
    `select c.id, c.id as conversation_id, c.last_message_at as occurred_at,
       ch.kind as channel_kind, c.customer_name, c.customer_handle,
       c.status as conversation_status, delivery.status as outbound_status,
       delivery.provider_status, delivery.outbound_purpose,
       coalesce(cl.business_profile->>'demoSeed', '') <> '' as is_local_demo
     from conversations c join channels ch on ch.id = c.channel_id and ch.client_id = c.client_id
     join clients cl on cl.id = c.client_id
     left join lateral (
       select o.status, o.metadata->>'providerStatus' as provider_status,
         o.metadata->>'purpose' as outbound_purpose
       from outbound_messages o where o.conversation_id = c.id and o.client_id = c.client_id
       order by o.created_at desc limit 1
     ) delivery on true
     where c.client_id = $1 order by c.last_message_at desc limit 60`, [clientId]);
  return result.rows;
}

export type RecentKnowledgeChange = { source_id: string; title: string; version_number: number;
  change_type: string; created_at: Date };
export async function getRecentKnowledgeChanges(clientId: string): Promise<RecentKnowledgeChange[]> {
  const result = await query<RecentKnowledgeChange>(
    `select source_id, title, version_number, change_type, created_at
     from knowledge_source_versions where client_id = $1 order by created_at desc limit 10`, [clientId]);
  return result.rows;
}

export type BusinessKnowledgeSource = { id: string; title: string; source_type: string;
  metadata: Record<string, unknown>; created_at: Date; last_reviewed_at: Date | null };
export async function getBusinessKnowledgeSources(clientId: string): Promise<BusinessKnowledgeSource[]> {
  const result = await query<BusinessKnowledgeSource>(
    `select s.id, s.title, s.source_type, s.metadata, s.created_at,
       (select max(v.created_at) from knowledge_source_versions v
        where v.source_id = s.id and v.client_id = s.client_id) as last_reviewed_at
     from knowledge_sources s where s.client_id = $1 order by s.title`, [clientId]);
  return result.rows;
}

export function deliveryLabel(status: string | null, providerStatus: string | null, localDemo: boolean): string {
  if (localDemo && (providerStatus === "failed" || status === "dead" || status === "failed"))
    return "Failed (local test)";
  if (localDemo && status === "uncertain") return "Uncertain (local test)";
  if (localDemo && (status === "pending" || status === "sending")) return "Queued (local test)";
  if (localDemo) return "Simulated / local test only";
  if (providerStatus === "delivered" || providerStatus === "read") return "Delivered (provider observed)";
  if (providerStatus === "failed" || status === "dead" || status === "failed") return "Failed";
  if (status === "uncertain") return "Uncertain — Pronto is checking";
  if (status === "sent") return "Provider accepted; delivery unverified";
  if (status === "pending" || status === "sending") return "Queued";
  if (status === "suppressed") return "Paused for human response";
  return "No reply queued";
}
