import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getBusinessActivity, getBusinessChannelOverview, getRecentKnowledgeChanges, deliveryLabel } from "@/lib/business-portal";
import { getClient } from "@/lib/dashboard";
import { canViewBusinessConversation } from "@/lib/staff-permissions";
import { AppShell } from "@/components/shell";
import { Badge } from "@/components/badge";

export default async function ClientActivityPage() {
  const user = await requireUser("client");
  if (!user.clientId) throw new Error("Business assignment required.");
  const canView = await canViewBusinessConversation(user, user.clientId);
  const [client, activity, knowledge, channels] = await Promise.all([
    getClient(user.clientId), canView ? getBusinessActivity(user.clientId) : Promise.resolve([]),
    getRecentKnowledgeChanges(user.clientId), getBusinessChannelOverview(user.clientId),
  ]);
  if (!client) throw new Error("Business not found.");
  const interruptions = channels.filter((channel) => channel.status === "active" && channel.last_health_status === "degraded");
  return <AppShell user={user} active="client" clientActive="activity" workspaceName={client.name}>
    <h1 className="text-2xl font-semibold">Recent Activity</h1>
    <p className="mb-5 mt-1 text-sm text-muted">What Pronto has handled and what still needs a person.</p>
    {interruptions.length ? <section className="ui-panel mb-5 p-4"><h2 className="font-semibold">Channel connection needs attention</h2>
      <p className="mt-1 text-sm text-muted">{interruptions.map((item) => item.name).join(", ")}. Pronto is reviewing the connection.</p>
      <Link href="/client/channels" className="mt-2 inline-block text-sm text-accent">View channels</Link></section> : null}
    <section className="ui-panel"><div className="ui-panel-header"><h2 className="font-semibold">Customer conversations</h2></div>
      {!canView ? <p className="p-4 text-sm text-muted">Conversation activity is available to designated responders.</p>
        : activity.length === 0 ? <p className="p-4 text-sm text-muted">No customer conversations yet.</p>
          : <ul className="divide-y divide-line">{activity.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div><p className="font-medium">{item.customer_name ?? item.customer_handle ?? "Customer enquiry"}</p>
              <p className="text-sm text-muted">{item.channel_kind} · {item.conversation_status === "escalated" ? "Human handoff" :
                item.outbound_purpose === "escalation_resolution_reply" ? "Staff responded" :
                item.outbound_purpose === "agent_answer" ? "Answered by Pronto" :
                item.conversation_status === "closed" ? "Resolved" : "In progress"}</p>
              <p className="mt-1 text-xs text-muted">{new Date(item.occurred_at).toLocaleString("en-SG", { timeZone: "Asia/Singapore" })}</p></div>
            <div className="flex items-center gap-3"><Badge tone={item.outbound_status === "dead" || item.outbound_status === "failed" ? "red" : "neutral"}>
              {deliveryLabel(item.outbound_status, item.provider_status, item.is_local_demo)}</Badge>
              <Link href={`/client/conversations/${item.conversation_id}`} className="text-sm text-accent">Open</Link></div>
          </li>)}</ul>}
    </section>
    <section className="ui-panel mt-5"><div className="ui-panel-header"><h2 className="font-semibold">Approved business information</h2></div>
      {knowledge.length === 0 ? <p className="p-4 text-sm text-muted">No published changes yet.</p>
        : <ul className="divide-y divide-line">{knowledge.map((item) => <li key={`${item.source_id}:${item.version_number}`} className="p-4 text-sm">
          <strong>{item.title}</strong> · version {item.version_number} · {item.change_type}
          <span className="ml-2 text-muted">{new Date(item.created_at).toLocaleDateString("en-SG")}</span>
        </li>)}</ul>}
    </section>
  </AppShell>;
}
