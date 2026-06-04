import { requireUser } from "@/lib/auth";
import { getMetrics, getOpenEscalations } from "@/lib/dashboard";
import { AppShell } from "@/components/shell";
import { OperatorNav } from "@/components/operator/operator-nav";
import { OperatorEscalationList } from "@/components/operator/operator-panels";
import { StatCard } from "@/components/stat-card";

export const dynamic = "force-dynamic";

export default async function OperatorEscalationsPage() {
  const user = await requireUser("operator");
  const [metrics, escalations] = await Promise.all([
    getMetrics(),
    getOpenEscalations(),
  ]);

  return (
    <AppShell user={user} active="operator">
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-[-0.01em]">Escalation queue</h1>
        <p className="text-sm text-muted">
          Cross-client queue for Pronto operators to claim, reply, and resolve issues.
        </p>
      </div>
      <OperatorNav active="escalations" />

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard label="Actionable escalations" value={metrics.openEscalations} />
        <StatCard label="Total escalations" value={metrics.escalations} />
        <StatCard label="Escalation rate" value={`${Math.round(metrics.escalationRate * 100)}%`} />
      </section>

      <section className="mt-6 ui-panel">
        <div className="ui-panel-header">
          <h2 className="text-base font-semibold">Active escalations</h2>
        </div>
        <OperatorEscalationList
          escalations={escalations}
          returnTo={(escalation) => `/operator/escalations#escalation-${escalation.id}`}
        />
      </section>
    </AppShell>
  );
}
