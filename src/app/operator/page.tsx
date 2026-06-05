import { ArrowRight, Clock3, RadioTower, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getFilteredConversations, getOperatorCommandCenter } from "@/lib/reporting";
import { AppShell } from "@/components/shell";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/badge";

export const dynamic = "force-dynamic";

export default async function OperatorPage() {
  const user = await requireUser("operator");
  const [commandCenter, conversations] = await Promise.all([
    getOperatorCommandCenter(),
    getFilteredConversations({ limit: 8 }),
  ]);

  return (
    <AppShell
      user={user}
      active="operator"
      operatorActive="clients"
      operatorClients={commandCenter.clientHealth}
    >
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.01em]">Command center</h1>
          <p className="text-sm text-muted">
            Cross-client launch readiness, live operations, and quality blockers.
          </p>
        </div>
        <Link className="ui-button px-3 py-2 text-accent" href="/operator/conversations">
          Open conversation queue
        </Link>
      </div>

      <section className="grid gap-4 md:grid-cols-6">
        <StatCard label="Needs action" value={commandCenter.needsActionNow} />
        <StatCard label="SLA breaches" value={commandCenter.slaBreaches} />
        <StatCard label="Failed sends" value={commandCenter.failedSends} />
        <StatCard label="Degraded clients" value={commandCenter.degradedClients} />
        <StatCard label="Launch blockers" value={commandCenter.launchBlockers} />
        <StatCard label="Quality blockers" value={commandCenter.qualityBlockers} hint="Target: zero" />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div id="alerts" className="ui-panel">
          <div className="ui-panel-header">
            <div className="flex items-center gap-2">
              <ShieldAlert size={17} className="text-danger" />
              <h2 className="text-base font-semibold">Action queue</h2>
            </div>
            <p className="text-sm text-muted">Critical items first, then newest warnings.</p>
          </div>
          <div className="divide-y divide-line">
            {commandCenter.actionQueue.length === 0 ? (
              <p className="p-4 text-sm text-muted">No open operational actions.</p>
            ) : (
              commandCenter.actionQueue.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="flex items-center justify-between gap-4 p-4 hover:bg-surface-hover"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={item.severity === "critical" ? "red" : "amber"}>
                        {item.severity}
                      </Badge>
                      <Badge tone="neutral">{item.kind}</Badge>
                      <p className="font-medium">{item.title}</p>
                    </div>
                    <p className="mt-1 text-sm text-muted">{item.clientName}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-muted">{item.detail}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-sm text-muted">
                    <span className="hidden sm:inline">{formatWhen(item.occurredAt)}</span>
                    <ArrowRight size={17} />
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="ui-panel">
          <div className="ui-panel-header">
            <div className="flex items-center gap-2">
              <RadioTower size={17} className="text-accent" />
              <h2 className="text-base font-semibold">Client health</h2>
            </div>
            <p className="text-sm text-muted">What needs launch or live-ops attention.</p>
          </div>
          <div className="divide-y divide-line">
            {commandCenter.clientHealth.length === 0 ? (
              <p className="p-4 text-sm text-muted">No clients have been created.</p>
            ) : (
              commandCenter.clientHealth.map((client) => (
                <Link
                  key={client.clientId}
                  href={`/operator/clients/${client.clientId}`}
                  className="block p-4 hover:bg-surface-hover"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{client.name}</p>
                        <Badge tone={healthTone(client.health)}>{client.health}</Badge>
                        <Badge tone="neutral">{client.status}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted">
                        {client.vertical} · {client.planTier}
                      </p>
                    </div>
                    <ArrowRight size={17} className="shrink-0 text-muted" />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted">
                    <HealthMetric label="Triage" value={client.openTriage} danger={client.slaBreaches > 0} />
                    <HealthMetric label="Channels" value={`${client.activeChannels}/${client.degradedChannels}`} danger={client.degradedChannels > 0} />
                    <HealthMetric label="Sources" value={client.knowledgeSources} danger={client.knowledgeSources === 0} />
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="mt-6 ui-panel">
        <div className="ui-panel-header">
          <div className="flex items-center gap-2">
            <Clock3 size={17} className="text-muted" />
            <h2 className="text-base font-semibold">Recent conversations</h2>
          </div>
          <Link className="text-sm font-medium text-accent" href="/operator/conversations">
            View all
          </Link>
        </div>
        <div className="divide-y divide-line">
          {conversations.map((conversation) => (
            <Link
              key={conversation.id}
              href={`/operator/clients/${conversation.client_id}/conversations/${conversation.id}`}
              className="block p-4 hover:bg-surface-hover"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{conversation.client_name}</p>
                <Badge tone={conversation.status === "escalated" ? "red" : "green"}>
                  {conversation.status}
                </Badge>
                {conversation.active_escalation_reason_code ? (
                  <Badge tone="red">{conversation.active_escalation_reason_code}</Badge>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-muted">
                {conversation.customer_name ?? conversation.customer_handle ?? "Customer"}
              </p>
              <p className="mt-1 line-clamp-2 text-sm text-muted">{conversation.last_message}</p>
            </Link>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

function HealthMetric({
  label,
  value,
  danger,
}: {
  label: string;
  value: number | string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-md border border-line bg-surface px-2.5 py-2">
      <p>{label}</p>
      <p className={`mt-1 text-sm font-semibold ${danger ? "text-danger" : "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}

function healthTone(health: "critical" | "warning" | "healthy"): "red" | "amber" | "green" {
  if (health === "critical") {
    return "red";
  }
  if (health === "warning") {
    return "amber";
  }
  return "green";
}

function formatWhen(value: Date | null): string {
  if (!value) {
    return "No timestamp";
  }
  return value.toLocaleDateString("en-SG", {
    month: "short",
    day: "numeric",
  });
}
