import { ArrowRight, MessageSquareWarning } from "lucide-react";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import {
  getClients,
  getMetrics,
  getOpenEscalations,
  getRecentConversations,
} from "@/lib/dashboard";
import { AppShell } from "@/components/shell";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/badge";
import { DeliveryStatusBadge } from "@/components/delivery-status";
import { OperatorNav } from "@/components/operator/operator-nav";

export const dynamic = "force-dynamic";

export default async function OperatorPage() {
  const user = await requireUser("operator");
  const [metrics, clients, escalations, conversations] = await Promise.all([
    getMetrics(),
    getClients(),
    getOpenEscalations(),
    getRecentConversations(undefined, 8),
  ]);

  return (
    <AppShell user={user} active="operator">
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-[-0.01em]">Operator dashboard</h1>
        <p className="text-sm text-muted">
          Internal Pronto view for client setup, launch readiness, and urgent operations.
        </p>
      </div>
      <OperatorNav active="clients" />

      <section className="grid gap-4 md:grid-cols-5">
        <StatCard label="Active clients" value={metrics.activeClients} />
        <StatCard label="Conversations" value={metrics.conversations} />
        <StatCard label="Triage items" value={metrics.escalations} />
        <StatCard label="Actionable triage" value={metrics.openEscalations} />
        <StatCard
          label="Hallucinations"
          value={metrics.hallucinationIncidents}
          hint="Target: zero"
        />
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="ui-panel">
          <div className="ui-panel-header">
            <h2 className="text-base font-semibold">Clients</h2>
          </div>
          <div className="divide-y divide-line">
            {clients.map((client) => (
              <Link
                key={client.id}
                href={`/operator/clients/${client.id}`}
                className="flex items-center justify-between gap-4 p-4 hover:bg-surface-hover"
              >
                <div>
                  <p className="font-medium">{client.name}</p>
                  <p className="text-sm text-muted">
                    {client.vertical} · {client.plan_tier} · {client.status}
                  </p>
                </div>
                <ArrowRight size={17} className="text-muted" />
              </Link>
            ))}
          </div>
        </div>

        <div className="ui-panel">
          <div className="flex items-center gap-2 ui-panel-header">
            <MessageSquareWarning size={17} className="text-danger" />
            <h2 className="text-base font-semibold">Actionable triage</h2>
          </div>
          <div className="divide-y divide-line">
            {escalations.length === 0 ? (
              <p className="p-4 text-sm text-muted">No actionable triage.</p>
            ) : (
              escalations.map((escalation) => (
                <div key={escalation.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={escalation.status === "claimed" ? "amber" : "red"}>
                      {escalation.status}
                    </Badge>
                    <Badge tone="red">{escalation.reason_code}</Badge>
                    <DeliveryStatusBadge
                      label="owner"
                      status={escalation.owner_notification_status}
                      error={escalation.owner_notification_error}
                    />
                  </div>
                  <Link
                    href={`/operator/clients/${escalation.client_id}/conversations/${escalation.conversation_id}`}
                    className="mt-2 block text-sm font-medium text-accent"
                  >
                    {escalation.client_name}
                  </Link>
                  <p className="mt-1 text-sm text-muted">{escalation.customer_message}</p>
                  <p className="mt-2 text-sm text-muted">{escalation.reason_detail}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="mt-6 ui-panel">
        <div className="ui-panel-header">
          <h2 className="text-base font-semibold">Recent conversations</h2>
        </div>
        <div className="divide-y divide-line">
          {conversations.map((conversation) => (
            <Link
              key={conversation.id}
              href={`/operator/clients/${conversation.client_id}/conversations/${conversation.id}`}
              className="block p-4 hover:bg-surface-hover"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{conversation.customer_name ?? conversation.customer_handle}</p>
                <Badge tone={conversation.status === "escalated" ? "red" : "green"}>
                  {conversation.status}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted">{conversation.last_message}</p>
            </Link>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
