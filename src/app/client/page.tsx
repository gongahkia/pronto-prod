import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getClient } from "@/lib/dashboard";
import { getBusinessAttention } from "@/lib/business-portal";
import { listKnowledgeSuggestions } from "@/lib/knowledge/suggestions";
import { listSourceSubmissions } from "@/lib/knowledge/submissions";
import { listKnowledgeReviewItems } from "@/lib/knowledge/review-items";
import { getEscalationPolicy } from "@/lib/staff-configuration";
import { canViewBusinessConversation, hasStaffCapability } from "@/lib/staff-permissions";
import { AppShell } from "@/components/shell";
import { Badge } from "@/components/badge";

export default async function ClientNeedsAttentionPage() {
  const user = await requireUser("client");
  if (!user.clientId) throw new Error("Business assignment required.");
  const canRespond = await canViewBusinessConversation(user, user.clientId);
  const canApprove = await hasStaffCapability(user, user.clientId, "knowledge.approve");
  const [client, items, suggestions, submissions, reviewItems, policy] = await Promise.all([
    getClient(user.clientId), canRespond ? getBusinessAttention(user.clientId) : Promise.resolve([]),
    canApprove ? listKnowledgeSuggestions(user.clientId) : Promise.resolve([]),
    canApprove ? listSourceSubmissions(user.clientId) : Promise.resolve([]),
    listKnowledgeReviewItems(user.clientId),
    getEscalationPolicy(user.clientId),
  ]);
  if (!client) throw new Error("Business not found.");
  const pendingSuggestions = suggestions.filter((item) => item.status === "pending");
  const pendingSources = submissions.filter((item) => item.status === "pending");
  return <AppShell user={user} active="client" clientActive="attention" workspaceName={client.name}>
    <header className="mb-6"><p className="text-xs font-semibold uppercase tracking-wide text-accent">Your workspace</p>
      <h1 className="text-2xl font-semibold">Needs Attention</h1>
      <p className="mt-1 text-sm text-muted">Customer handoffs and business decisions that need a person.</p></header>
    <div className="mb-5 grid gap-3 sm:grid-cols-3">
      <div className="ui-panel p-4"><p className="text-sm text-muted">Customer handoffs</p><p className="mt-1 text-2xl font-semibold">{items.length}</p></div>
      <div className="ui-panel p-4"><p className="text-sm text-muted">Knowledge to review</p><p className="mt-1 text-2xl font-semibold">{pendingSuggestions.length + pendingSources.length + reviewItems.filter((item) => item.status === "open").length}</p></div>
      <div className="ui-panel p-4"><p className="text-sm text-muted">Response target</p>
        <p className="mt-1 text-lg font-semibold">{policy?.policy.targetMinutes == null ? "Not set" : `${policy.policy.targetMinutes} minutes`}</p>
        <p className="text-xs text-muted">Operating target, not a guaranteed response time.</p></div>
    </div>
    <section className="ui-panel"><div className="ui-panel-header flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-semibold">Conversations needing a person</h2>
      {canRespond ? <Link href="/client/inbox?status=needs_reply" className="text-sm text-accent">View all conversations</Link> : null}
    </div>
      {!canRespond ? <p className="p-4 text-sm text-muted">Pronto can grant conversation access to designated responders.</p>
        : items.length === 0 ? <p className="p-4 text-sm text-muted">No customer conversation needs your reply right now.</p>
          : <ul className="divide-y divide-line">{items.map((item) => {
            const ageMinutes = item.age_minutes;
            const failedNotice = item.notification_status === "failed" || item.notification_status === "dead" ||
              item.notification_status === "uncertain";
            return <li key={item.escalation_id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div><p className="font-medium">{item.customer_name ?? item.customer_handle ?? "Customer enquiry"}</p>
                <p className="text-sm text-muted">{item.channel_kind} · waiting {ageMinutes < 60 ? `${ageMinutes} min` : `${Math.floor(ageMinutes / 60)} hr`}
                  {item.assigned_name ? ` · assigned to ${item.assigned_name}` : " · unclaimed"}</p>
                <div className="mt-2 flex flex-wrap gap-2"><Badge tone="amber">{item.status === "claimed" ? "Claimed" : "Unclaimed"}</Badge>
                  <Badge tone={item.conversation_status === "escalated" ? "amber" : "green"}>
                    AI {item.conversation_status === "escalated" ? "paused" : "state needs review"}</Badge>
                  {failedNotice ? <Badge tone="red">Staff notification needs review</Badge> : null}</div>
                {policy?.policy.targetMinutes != null ? <p className="mt-2 text-xs text-muted">Configured target: {policy.policy.targetMinutes} minutes.</p> : null}
              </div>
              <Link href={`/client/conversations/${item.conversation_id}`} className="ui-primary-button px-3 py-2 text-sm">
                {item.status === "open" ? "Claim or reply" : "Open handoff"}</Link>
            </li>;
          })}</ul>}
    </section>
    {canApprove ? <section className="ui-panel mt-5 p-4"><h2 className="font-semibold">Business information awaiting review</h2>
      {pendingSuggestions.length || pendingSources.length || reviewItems.some((item) => item.status === "open") ? <ul className="mt-3 space-y-2 text-sm">{pendingSuggestions.slice(0, 5).map((item) =>
        <li key={item.id} className="rounded border border-line p-3">{item.title} · revision {item.current_revision}</li>)}
        {pendingSources.slice(0, 5).map((item) => <li key={item.id} className="rounded border border-line p-3">Source: {item.title} · revision {item.current_revision}</li>)}
        {reviewItems.filter((item) => item.status === "open").slice(0, 5).map((item) =>
          <li key={item.id} className="rounded border border-line p-3">Unanswered: {item.question.slice(0, 120)}</li>)}
      </ul>
        : <p className="mt-2 text-sm text-muted">No suggested corrections need approval.</p>}
      <Link href="/client/knowledge" className="mt-3 inline-block text-sm font-medium text-accent">Review business knowledge</Link>
    </section> : null}
    <p className="mt-5 text-sm text-muted">Need to change a contact or response preference? <Link href="/client/channels" className="font-medium text-accent">View connected channels</Link>.</p>
  </AppShell>;
}
