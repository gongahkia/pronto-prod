import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { AppShell } from "@/components/shell";
import { query } from "@/lib/db";

export default async function KnowledgeConnectionsPage() {
  const actor = await requireUser("operator");
  const [knowledge, channels, integrations, staff] = await Promise.all([
    query<{ client_id: string; name: string; refreshes: string; drafts: string; conflicts: string; suggestions: string }>(
      `select c.id as client_id, c.name,
        (select count(*)::text from knowledge_refresh_requests r where r.client_id = c.id and r.status = 'open') as refreshes,
        (select count(*)::text from assistant_drafts d where d.client_id = c.id) as drafts,
        (select count(*)::text from knowledge_suggestions s where s.client_id = c.id and s.status in ('pending', 'approved')) as suggestions,
        (select count(*)::text from knowledge_sources k where k.client_id = c.id and
          (k.metadata->>'reviewStatus' ilike '%conflict%' or k.metadata->>'reviewStatus' ilike '%review%'
           or k.metadata->>'reviewStatus' ilike '%stale%')) as conflicts
       from clients c order by c.name`, []),
    query<{ client_id: string; name: string; channel_name: string; kind: string; status: string; last_health_status: string | null; draft_status: string | null }>(
      `select c.id as client_id, c.name, ch.name as channel_name, ch.kind::text,
        ch.status::text, ch.last_health_status, d.status::text as draft_status
       from channels ch join clients c on c.id = ch.client_id
       left join channel_drafts d on d.channel_id = ch.id and d.client_id = ch.client_id
       order by c.name, ch.name`, []),
    query<{ client_id: string; name: string; provider: string; rotation_due_at: Date | null }>(
      `select c.id as client_id, c.name, i.provider, i.rotation_due_at
       from integration_credentials i join clients c on c.id = i.client_id order by c.name, i.provider`, []),
    query<{ client_id: string; name: string; configured: string; verified: string }>(
      `select c.id as client_id, c.name, count(d.id)::text as configured,
       count(d.id) filter (where d.enabled and d.verified_at is not null)::text as verified
       from clients c left join staff_notification_destinations d on d.client_id = c.id
       group by c.id, c.name order by c.name`, []),
  ]);
  return <AppShell user={actor} active="operator" operatorActive="knowledge">
    <header className="mb-5"><h1 className="text-xl font-semibold">Knowledge & Connections</h1>
      <p className="text-sm text-muted">Review facts, channel setup and authorized business-system connections.</p></header>
    <section className="ui-panel mb-5"><div className="ui-panel-header"><h2 className="font-semibold">Knowledge review</h2></div>
      {knowledge.rows.length ? <ul className="divide-y divide-line">{knowledge.rows.map((item) => <li key={item.client_id} className="flex flex-wrap justify-between gap-2 p-4 text-sm">
        <span><strong>{item.name}</strong> · {item.suggestions} correction proposal · {item.drafts} draft · {item.refreshes} refresh request · {item.conflicts} flagged source</span>
        <Link href={`/operator/clients/${item.client_id}/knowledge`} className="text-accent">Review sources</Link>
      </li>)}</ul> : <p className="p-4 text-sm text-muted">No businesses yet.</p>}</section>
    <section className="ui-panel mb-5"><div className="ui-panel-header"><h2 className="font-semibold">Customer channels</h2></div>
      {channels.rows.length ? <ul className="divide-y divide-line">{channels.rows.map((item, index) => <li key={`${item.client_id}-${index}`} className="flex flex-wrap justify-between gap-2 p-4 text-sm">
        <span><strong>{item.name}</strong> · {item.channel_name} ({item.kind}) · {item.status} · health {item.last_health_status ?? "unchecked"}
          {item.draft_status ? ` · pending ${item.draft_status} proposal` : ""}</span>
        <Link href={`/operator/clients/${item.client_id}/channels`} className="text-accent">Open connection</Link>
      </li>)}</ul> : <p className="p-4 text-sm text-muted">No channels configured.</p>}</section>
    <section className="ui-panel mb-5"><div className="ui-panel-header"><h2 className="font-semibold">Staff contacts</h2></div>
      <ul className="divide-y divide-line">{staff.rows.map((item) => <li key={item.client_id} className="flex flex-wrap justify-between gap-2 p-4 text-sm">
        <span><strong>{item.name}</strong> · {item.verified}/{item.configured} verified and enabled</span>
        <Link href={`/operator/clients/${item.client_id}/onboarding`} className="text-accent">Review contacts</Link>
      </li>)}</ul></section>
    <section className="ui-panel"><div className="ui-panel-header"><h2 className="font-semibold">Business integrations</h2></div>
      {integrations.rows.length ? <ul className="divide-y divide-line">{integrations.rows.map((item, index) => <li key={`${item.client_id}-${index}`} className="flex flex-wrap justify-between gap-2 p-4 text-sm">
        <span><strong>{item.name}</strong> · {item.provider} · credential stored{item.rotation_due_at ? ` · rotation due ${new Date(item.rotation_due_at).toLocaleDateString()}` : ""}</span>
        <Link href={`/operator/clients/${item.client_id}/integrations`} className="text-accent">Review integration</Link>
      </li>)}</ul> : <p className="p-4 text-sm text-muted">No integration credentials stored.</p>}</section>
    <p className="mt-4 text-xs text-muted">Stored credentials and health results do not establish live customer delivery or provider approval.</p>
  </AppShell>;
}
