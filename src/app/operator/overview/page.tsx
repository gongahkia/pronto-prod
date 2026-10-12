import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { AppShell } from "@/components/shell";
import { getOperatorCommandCenter } from "@/lib/reporting";
import { getOperationsAttention, getOperationsReport } from "@/lib/operations-report";

export default async function OverviewPage() {
  const actor = await requireUser("operator");
  const [fleet, operations, issues] = await Promise.all([
    getOperatorCommandCenter(), getOperationsReport(), getOperationsAttention(8),
  ]);
  const count = (rows: Array<{status: string; count: string}>, statuses: string[]) =>
    rows.filter((row) => statuses.includes(row.status)).reduce((sum, row) => sum + Number(row.count), 0);
  return <AppShell user={actor} active="operator" operatorActive="overview">
    <header className="mb-5"><h1 className="text-xl font-semibold">Overview</h1>
      <p className="text-sm text-muted">Customer work, setup and delivery issues across businesses.</p></header>
    <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Fleet attention">
      <a className="ui-panel p-4" href="/operator/conversations?status=escalated"><strong className="block text-2xl">{fleet.needsActionNow}</strong><span>Handoffs and channel issues</span></a>
      <a className="ui-panel p-4" href="/operator/operations"><strong className="block text-2xl">{count(operations.outbound, ["uncertain", "dead"])}</strong><span>Delivery issues</span></a>
      <a className="ui-panel p-4" href="/operator/operations"><strong className="block text-2xl">{count(operations.inbound, ["failed", "dead"])}</strong><span>Inbound retries or dead jobs</span></a>
      <a className="ui-panel p-4" href="/operator"><strong className="block text-2xl">{fleet.setupNeeds}</strong><span>Businesses needing setup</span></a>
    </section>
    <section className="ui-panel"><div className="ui-panel-header"><h2 className="font-semibold">Priority work</h2></div>
      {issues.length ? <ul className="divide-y divide-line">{issues.map((item) =>
        <li key={`${item.kind}-${item.id}`} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
          <span><strong>{item.client_name}</strong> · {item.kind} {item.status}</span>
          <Link className="text-accent" href={`/operator/clients/${item.client_id}`}>Review business</Link></li>)}</ul>
        : <p className="p-4 text-sm text-muted">No exhausted or uncertain work recorded.</p>}
    </section>
    <p className="mt-4 text-xs text-muted">Portfolio health is a setup heuristic. Open Operations for worker and queue state; external delivery requires provider evidence.</p>
  </AppShell>;
}
