import { ArrowRight, RadioTower } from "lucide-react";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import {
  getOperatorCommandCenter,
  type OperatorClientHealth,
} from "@/lib/reporting";
import { AppShell } from "@/components/shell";
import { Badge } from "@/components/badge";
import { StatCard } from "@/components/stat-card";

export const dynamic = "force-dynamic";

export default async function OperatorPage() {
  const user = await requireUser("operator");
  const commandCenter = await getOperatorCommandCenter();

  return (
    <AppShell user={user} active="operator" operatorActive="clients">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.01em]">Clients</h1>
          <p className="text-sm text-muted">
            Portfolio health, launch state, and operational risk across every client.
          </p>
        </div>
        <Link className="ui-button px-3 py-2 text-accent" href="/operator/alerts">
          Open action inbox
        </Link>
      </div>

      <section className="grid gap-4 md:grid-cols-5">
        <StatCard label="Clients" value={commandCenter.clientHealth.length} />
        <StatCard label="Needs action" value={commandCenter.needsActionNow} />
        <StatCard label="SLA breaches" value={commandCenter.slaBreaches} />
        <StatCard label="Failed sends" value={commandCenter.failedSends} />
        <StatCard label="Launch blockers" value={commandCenter.launchBlockers} />
      </section>

      <section className="mt-6 ui-panel">
        <div className="ui-panel-header">
          <div className="flex items-center gap-2">
            <RadioTower size={17} className="text-accent" />
            <h2 className="text-base font-semibold">Client portfolio</h2>
          </div>
          <p className="text-sm text-muted">
            Highest-risk clients are listed first.
          </p>
        </div>

        <div className="divide-y divide-line">
          {commandCenter.clientHealth.length === 0 ? (
            <p className="p-4 text-sm text-muted">No clients have been created.</p>
          ) : (
            commandCenter.clientHealth.map((client) => (
              <ClientPortfolioRow key={client.clientId} client={client} />
            ))
          )}
        </div>
      </section>
    </AppShell>
  );
}

function ClientPortfolioRow({ client }: { client: OperatorClientHealth }) {
  return (
    <Link
      href={`/operator/clients/${client.clientId}`}
      className="block p-4 hover:bg-surface-hover"
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{client.name}</p>
            <Badge tone={healthTone(client.health)}>{client.health}</Badge>
            <Badge tone="neutral">{client.status}</Badge>
            <Badge tone="neutral">{client.planTier}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted">
            {client.vertical} · latest activity {formatWhen(client.latestActivityAt)}
          </p>
        </div>

        <div className="grid gap-2 text-xs text-muted sm:grid-cols-3 xl:w-[38rem] xl:grid-cols-6">
          <PortfolioMetric
            label="Channels"
            value={`${client.activeChannels}/${client.degradedChannels}`}
            danger={client.degradedChannels > 0}
          />
          <PortfolioMetric
            label="Triage"
            value={client.openTriage}
            danger={client.openTriage > 0}
          />
          <PortfolioMetric
            label="SLA"
            value={client.slaBreaches}
            danger={client.slaBreaches > 0}
          />
          <PortfolioMetric
            label="Failed sends"
            value={client.failedSends}
            danger={client.failedSends > 0}
          />
          <PortfolioMetric
            label="Sources"
            value={client.knowledgeSources}
            danger={client.knowledgeSources === 0}
          />
          <div className="flex items-center justify-end text-accent">
            <ArrowRight size={17} />
          </div>
        </div>
      </div>
    </Link>
  );
}

function PortfolioMetric({
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
      <p className={`mt-1 font-semibold ${danger ? "text-danger" : "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}

function healthTone(health: OperatorClientHealth["health"]): "red" | "amber" | "green" {
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
    return "not seen yet";
  }
  return value.toLocaleDateString("en-SG", {
    month: "short",
    day: "numeric",
  });
}
