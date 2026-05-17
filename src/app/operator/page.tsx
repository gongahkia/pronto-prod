import { ArrowRight, MessageSquareWarning } from "lucide-react";
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
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Operator dashboard</h1>
        <p className="text-sm text-muted">
          Configure clients, review agent behavior, and watch pilot quality.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-5">
        <StatCard label="Active clients" value={metrics.activeClients} />
        <StatCard label="Conversations" value={metrics.conversations} />
        <StatCard label="Escalations" value={metrics.escalations} />
        <StatCard label="Open escalations" value={metrics.openEscalations} />
        <StatCard
          label="Hallucinations"
          value={metrics.hallucinationIncidents}
          hint="Target: zero"
        />
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-lg border border-line bg-panel">
          <div className="border-b border-line p-4">
            <h2 className="text-base font-semibold">Clients</h2>
          </div>
          <div className="divide-y divide-line">
            {clients.map((client) => (
              <a
                key={client.id}
                href={`/operator/clients/${client.id}`}
                className="flex items-center justify-between gap-4 p-4 hover:bg-stone-50"
              >
                <div>
                  <p className="font-medium">{client.name}</p>
                  <p className="text-sm text-muted">
                    {client.vertical} · {client.plan_tier} · {client.status}
                  </p>
                </div>
                <ArrowRight size={17} className="text-muted" />
              </a>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-line bg-panel">
          <div className="flex items-center gap-2 border-b border-line p-4">
            <MessageSquareWarning size={17} className="text-danger" />
            <h2 className="text-base font-semibold">Open escalations</h2>
          </div>
          <div className="divide-y divide-line">
            {escalations.length === 0 ? (
              <p className="p-4 text-sm text-muted">No open escalations.</p>
            ) : (
              escalations.map((escalation) => (
                <div key={escalation.id} className="p-4">
                  <Badge tone="red">{escalation.reason_code}</Badge>
                  <p className="mt-2 text-sm text-muted">{escalation.reason_detail}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-line bg-panel">
        <div className="border-b border-line p-4">
          <h2 className="text-base font-semibold">Recent conversations</h2>
        </div>
        <div className="divide-y divide-line">
          {conversations.map((conversation) => (
            <div key={conversation.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{conversation.customer_name ?? conversation.customer_handle}</p>
                <Badge tone={conversation.status === "escalated" ? "red" : "green"}>
                  {conversation.status}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted">{conversation.last_message}</p>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

