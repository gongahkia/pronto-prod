import { AlertTriangle, ArrowRight } from "lucide-react";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import {
  getOperatorCommandCenter,
  type OperatorActionQueueItem,
} from "@/lib/reporting";
import { AppShell } from "@/components/shell";
import { Badge } from "@/components/badge";
import { StatCard } from "@/components/stat-card";

export const dynamic = "force-dynamic";

export default async function OperatorAlertsPage() {
  const user = await requireUser("operator");
  const commandCenter = await getOperatorCommandCenter();
  const critical = commandCenter.actionQueue.filter((item) => item.severity === "critical");
  const warnings = commandCenter.actionQueue.filter((item) => item.severity === "warning");

  return (
    <AppShell user={user} active="operator" operatorActive="alerts">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.01em]">Alerts</h1>
          <p className="text-sm text-muted">
            Cross-client action inbox for failed sends, SLA risk, degraded channels, knowledge refreshes, and quality blockers.
          </p>
        </div>
        <Link className="ui-button px-3 py-2 text-accent" href="/operator/conversations?status=escalated">
          Open escalations
        </Link>
      </div>

      <section className="grid gap-4 md:grid-cols-5">
        <StatCard label="Needs action" value={commandCenter.needsActionNow} />
        <StatCard label="Critical" value={critical.length} />
        <StatCard label="Warnings" value={warnings.length} />
        <StatCard label="Failed sends" value={commandCenter.failedSends} />
        <StatCard label="SLA breaches" value={commandCenter.slaBreaches} />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <AlertGroup title="Critical" items={critical} emptyText="No critical alerts." />
        <AlertGroup title="Warnings" items={warnings} emptyText="No warning alerts." />
      </section>
    </AppShell>
  );
}

function AlertGroup({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: OperatorActionQueueItem[];
  emptyText: string;
}) {
  return (
    <section className="ui-panel">
      <div className="ui-panel-header">
        <div className="flex items-center gap-2">
          <AlertTriangle size={17} className={items.length ? "text-danger" : "text-muted"} />
          <h2 className="text-base font-semibold">{title}</h2>
        </div>
        <Badge tone={items.length ? "red" : "green"}>{items.length} open</Badge>
      </div>
      <div className="divide-y divide-line">
        {items.length === 0 ? (
          <p className="p-4 text-sm text-muted">{emptyText}</p>
        ) : (
          items.map((item) => <AlertRow key={item.id} item={item} />)
        )}
      </div>
    </section>
  );
}

function AlertRow({ item }: { item: OperatorActionQueueItem }) {
  return (
    <Link
      href={item.href}
      className="flex items-center justify-between gap-4 p-4 hover:bg-surface-hover"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={item.severity === "critical" ? "red" : "amber"}>{item.severity}</Badge>
          <Badge tone="neutral">{kindLabel(item.kind)}</Badge>
          <p className="font-medium">{item.title}</p>
        </div>
        <p className="mt-1 text-sm text-muted">{item.clientName}</p>
        <p className="mt-1 line-clamp-2 text-sm text-muted">{item.detail}</p>
        <p className="mt-2 text-xs text-muted">{formatWhen(item.occurredAt)}</p>
      </div>
      <ArrowRight size={17} className="shrink-0 text-muted" />
    </Link>
  );
}

function kindLabel(kind: OperatorActionQueueItem["kind"]): string {
  if (kind === "sla") {
    return "SLA";
  }
  if (kind === "outbound") {
    return "Outbound";
  }
  if (kind === "channel") {
    return "Channel";
  }
  if (kind === "knowledge") {
    return "Knowledge";
  }
  return "Quality";
}

function formatWhen(value: Date | null): string {
  if (!value) {
    return "No timestamp";
  }
  return value.toLocaleString("en-SG", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
