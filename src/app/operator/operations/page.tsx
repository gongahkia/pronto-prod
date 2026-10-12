import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { AppShell } from "@/components/shell";
import { getOperationsAttention, getOperationsReport } from "@/lib/operations-report";

export default async function OperationsPage() {
  const actor = await requireUser("operator");
  const [report, issues] = await Promise.all([getOperationsReport(), getOperationsAttention()]);
  return <AppShell user={actor} active="operator" operatorActive="operations">
    <header className="mb-5"><h1 className="text-xl font-semibold">Operations</h1>
      <p className="text-sm text-muted">Review durable work and reconcile uncertain delivery before retrying.</p></header>
    <section className="ui-panel mb-5 p-4"><h2 className="font-semibold">Worker</h2>
      <p className="text-sm">{report.workerFresh ? "Heartbeat fresh" : "Heartbeat missing or stale"}</p>
      {report.heartbeatAt ? <p className="text-xs text-muted">Last cycle: {new Date(report.heartbeatAt).toLocaleString()}</p> : null}</section>
    <section className="mb-5 grid gap-3 md:grid-cols-3">
      {(["inbound", "outbound", "staff"] as const).map((kind) => <div className="ui-panel p-4" key={kind}>
        <h2 className="font-semibold capitalize">{kind === "staff" ? "Staff notifications" : kind}</h2>
        <ul className="mt-2 space-y-1 text-sm">{report[kind].length ? report[kind].map((row) =>
          <li key={row.status}>{row.status}: {row.count}{row.oldest_at ? ` · oldest ${new Date(row.oldest_at).toLocaleString()}` : ""}</li>)
          : <li>No pending issues</li>}</ul></div>)}</section>
    <section className="ui-panel mb-5"><div className="ui-panel-header"><h2 className="font-semibold">Requires action</h2></div>
      {issues.length ? <ul className="divide-y divide-line">{issues.map((item) => <li key={item.id} className="p-4 text-sm">
        <div className="flex flex-wrap justify-between gap-2"><span><strong>{item.client_name}</strong> · {item.kind} {item.status}</span>
          <Link href={`/operator/clients/${item.client_id}`} className="text-accent">Open business</Link></div>
        {item.last_error ? <p className="text-muted">{item.last_error}</p> : null}
        {item.kind === "staff notification" && (item.status === "uncertain" || item.status === "dead") ?
          <form action={`/api/operator/staff-notifications/${item.id}/retry`} method="post" className="mt-2 flex flex-wrap gap-2">
            <input type="hidden" name="clientId" value={item.client_id}/>
            <input name="reconciliation" required className="ui-input px-2 py-1" placeholder="Provider reconciliation result" aria-label="Provider reconciliation result"/>
            <button className="ui-button px-2 py-1">Retry after reconciliation</button>
          </form> : null}</li>)}</ul> : <p className="p-4 text-sm text-muted">No exhausted or uncertain work recorded.</p>}</section>
    <section className="ui-panel"><div className="ui-panel-header"><h2 className="font-semibold">Recent unacknowledged errors</h2></div>
      {report.errors.length ? <ul className="divide-y divide-line">{report.errors.map((error) => <li key={error.id} className="flex flex-wrap justify-between gap-3 p-4 text-sm">
        <span>{error.severity} · {error.source} · {error.eventName}{error.clientId ? ` · business ${error.clientId}` : ""}</span>
        <form action={`/api/operator/errors/${error.id}/acknowledge`} method="post"><button className="ui-button px-2 py-1">Acknowledge</button></form>
      </li>)}</ul> : <p className="p-4 text-sm text-muted">No unacknowledged errors.</p>}</section>
  </AppShell>;
}
