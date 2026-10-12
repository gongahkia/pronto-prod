import { ArrowRight, ChevronDown, RadioTower } from "lucide-react";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/date-format";
import {
  getOperatorCommandCenter,
  type OperatorClientHealth,
} from "@/lib/reporting";
import { AppShell } from "@/components/shell";
import { Badge } from "@/components/badge";
import { query } from "@/lib/db";
import { nextOnboardingAction, type OnboardingStage } from "@/lib/onboarding";

export default async function OperatorPage({ searchParams }: {
  searchParams?: Promise<{ q?: string }>;
}) {
  const user = await requireUser("operator");
  const [commandCenter, stageRows, params] = await Promise.all([
    getOperatorCommandCenter(),
    query<OnboardingStage>("select * from onboarding_stages", []),
    searchParams ?? Promise.resolve({ q: "" }),
  ]);
  const search = (params.q ?? "").trim().toLowerCase();
  const portfolio = commandCenter.clientHealth.filter((client) =>
    !search || `${client.name} ${client.vertical} ${client.status}`.toLowerCase().includes(search));
  const stagesByClient = new Map<string, OnboardingStage[]>();
  for (const stage of stageRows.rows) stagesByClient.set(stage.client_id,
    [...(stagesByClient.get(stage.client_id) ?? []), stage]);

  return (
    <AppShell user={user} active="operator" operatorActive="businesses">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Businesses</h1>
          <p className="text-sm text-muted">
            Setup progress and open customer work across businesses.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <details className="relative">
            <summary className="ui-button inline-flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-accent">
              Open client
              <ChevronDown size={15} aria-hidden="true" />
            </summary>
            <div className="absolute right-0 top-11 z-30 w-72 rounded-md border border-line bg-panel p-2 shadow-lg">
              {commandCenter.clientHealth.length === 0 ? (
                <p className="px-3 py-2 text-sm text-muted">No clients yet.</p>
              ) : (
                commandCenter.clientHealth.map((client) => (
                  <Link
                    key={client.clientId}
                    href={`/operator/clients/${client.clientId}`}
                    className="block rounded-md px-3 py-2 text-sm font-medium hover:bg-surface-hover"
                  >
                    {client.name}
                  </Link>
                ))
              )}
            </div>
          </details>
          <Link
            className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-dark"
            href="/operator/clients/new"
          >
            Create client
          </Link>
        </div>
      </div>

      <section className="ui-panel">
        <div className="ui-panel-header">
          <div className="flex items-center gap-2">
            <RadioTower size={17} className="text-accent" />
            <h2 className="text-base font-semibold">Client portfolio</h2>
          </div>
        </div>
        <form action="/operator" className="flex gap-2 border-b border-line p-4">
          <input className="ui-input min-w-0 flex-1 px-3 py-2" name="q" defaultValue={params.q ?? ""}
            aria-label="Search businesses" placeholder="Search name, industry or status" />
          <button className="ui-button px-3 py-2">Search</button>
        </form>

        <div className="divide-y divide-line">
          {portfolio.length === 0 ? (
            <p className="p-4 text-sm text-muted">{search ? "No businesses match this search." : "No businesses have been created."}</p>
          ) : (
            portfolio.map((client) => (
              <ClientPortfolioRow key={client.clientId} client={client}
                nextAction={nextOnboardingAction(stagesByClient.get(client.clientId) ?? [])} />
            ))
          )}
        </div>
      </section>
    </AppShell>
  );
}

function ClientPortfolioRow({ client, nextAction }: { client: OperatorClientHealth; nextAction: string }) {
  return (
    <div className="p-4 hover:bg-surface-hover">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/operator/clients/${client.clientId}`}
              className="font-medium text-accent hover:text-accent-dark"
            >
              {client.name}
            </Link>
            <Badge tone={healthTone(client.health)}>{client.health}</Badge>
            <Badge tone="neutral">{client.status}</Badge>
            <Badge tone="neutral">{client.planTier}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted">
            {client.vertical} · latest activity {formatWhen(client.latestActivityAt)}
          </p>
          <Link href={`/operator/clients/${client.clientId}/onboarding`} className="mt-1 block text-sm text-accent">
            Next: {nextAction}
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs text-muted md:grid-cols-3 xl:w-[26rem] xl:grid-cols-4">
          <PortfolioMetric
            label="Channels"
            value={client.activeChannels}
            hint={client.degradedChannels ? `${client.degradedChannels} need review` : "active"}
            danger={client.degradedChannels > 0}
          />
          <PortfolioMetric
            label="Triage"
            value={client.openTriage}
            danger={client.openTriage > 0}
          />
          <PortfolioMetric
            label="Sources"
            value={client.knowledgeSources}
            danger={client.knowledgeSources === 0}
          />
          <Link
            href={`/operator/clients/${client.clientId}`}
            className="flex items-center justify-end text-accent"
            aria-label={`Open ${client.name}`}
          >
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function PortfolioMetric({
  label,
  value,
  hint,
  danger,
}: {
  label: string;
  value: number | string;
  hint?: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-md border border-line bg-surface px-2.5 py-2">
      <p>{label}</p>
      <p className={`mt-1 font-semibold ${danger ? "text-danger" : "text-foreground"}`}>
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[11px]">{hint}</p> : null}
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
  return formatDate(value);
}
