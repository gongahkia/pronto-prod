import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isoDate } from "@/lib/date-format";
import { getClient } from "@/lib/dashboard";
import {
  defaultMonthlyWindow,
  formatMonthlyCheckInReport,
  generateMonthlyCheckInReport,
} from "@/lib/monthly-report";
import { AppShell } from "@/components/shell";
import {
  OperatorClientHeader,
  OperatorClientNav,
} from "@/components/operator/operator-nav";

export default async function OperatorClientMonthlyReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser("operator");
  const { clientId } = await params;
  const resolved = searchParams ? await searchParams : {};
  const asOfParam = typeof resolved.asOf === "string" ? resolved.asOf : undefined;
  const asOf = asOfParam ? new Date(asOfParam) : new Date();
  const validAsOf = Number.isNaN(asOf.getTime()) ? new Date() : asOf;

  const client = await getClient(clientId);
  if (!client) {
    notFound();
  }

  const { windowStart, windowEnd } = defaultMonthlyWindow(validAsOf);
  const report = await generateMonthlyCheckInReport({
    clientId,
    windowStart,
    windowEnd,
  });
  const text = formatMonthlyCheckInReport(report);

  return (
    <AppShell user={user} active="operator">
      <OperatorClientHeader
        client={client}
        description="30-day performance summary with recommended knowledge updates."
      />
      <OperatorClientNav clientId={client.id} active="overview" />

      <form action="" className="mb-4 flex flex-wrap items-end gap-3 text-sm">
        <label className="block">
          <span className="text-muted">As of</span>
          <input
            type="date"
            name="asOf"
            defaultValue={isoDate(validAsOf)}
            className="ui-input ml-2"
          />
        </label>
        <button type="submit" className="ui-button px-3 py-1">
          Regenerate
        </button>
      </form>

      <section className="ui-panel">
        <div className="ui-panel-header">
          <h2 className="text-base font-semibold">Monthly check-in</h2>
          <p className="text-sm text-muted">
            Window {isoDate(report.windowStart)} → {isoDate(report.windowEnd)}
          </p>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Conversations" value={String(report.metrics.conversations)} />
          <Stat label="Escalations" value={String(report.metrics.escalations)} />
          <Stat
            label="Escalation rate"
            value={`${(report.metrics.escalationRate * 100).toFixed(1)}%`}
          />
          <Stat
            label="Knowledge gaps"
            value={String(report.metrics.knowledgeGapCount)}
          />
          <Stat
            label="CSAT"
            value={
              report.metrics.csatAverage === null
                ? "—"
                : `${report.metrics.csatAverage.toFixed(2)} (${report.metrics.csatResponses})`
            }
          />
          <Stat
            label="Avg first response"
            value={
              report.metrics.avgFirstResponseSeconds === null
                ? "—"
                : `${Math.round(report.metrics.avgFirstResponseSeconds)} s`
            }
          />
        </div>
      </section>

      {report.topEscalationReasons.length > 0 && (
        <section className="ui-panel mt-6">
          <div className="ui-panel-header">
            <h2 className="text-base font-semibold">Top escalation reasons</h2>
          </div>
          <ul className="divide-y divide-line">
            {report.topEscalationReasons.map((row) => (
              <li
                key={row.reason_code}
                className="flex items-center justify-between px-4 py-2 text-sm"
              >
                <span>{row.reason_code}</span>
                <span className="font-mono text-xs text-muted">{row.count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {report.recommendations.length > 0 && (
        <section className="ui-panel mt-6">
          <div className="ui-panel-header">
            <h2 className="text-base font-semibold">Recommendations</h2>
          </div>
          <ul className="divide-y divide-line">
            {report.recommendations.map((rec, index) => (
              <li key={index} className="px-4 py-3 text-sm">
                <p className="font-mono text-xs uppercase tracking-wide text-muted">
                  {rec.type}
                </p>
                <p className="mt-1">{rec.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="ui-panel mt-6">
        <div className="ui-panel-header">
          <h2 className="text-base font-semibold">Plain text export</h2>
          <p className="text-sm text-muted">
            Copy this into a check-in email or PR description.
          </p>
        </div>
        <pre className="overflow-x-auto whitespace-pre-wrap p-4 text-xs">{text}</pre>
      </section>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-line bg-surface px-3 py-2">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
