import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getOpenEscalations } from "@/lib/dashboard";
import { AppShell } from "@/components/shell";

export const dynamic = "force-dynamic";

export default async function OperatorAllEscalationsPage() {
  const user = await requireUser("operator");
  const escalations = await getOpenEscalations();

  const byClient = new Map<string, typeof escalations>();
  for (const escalation of escalations) {
    const bucket = byClient.get(escalation.client_id) ?? [];
    bucket.push(escalation);
    byClient.set(escalation.client_id, bucket);
  }

  return (
    <AppShell user={user} active="operator">
      <div className="mb-5">
        <h1 className="text-xl font-semibold">Cross-client escalations</h1>
        <p className="text-sm text-muted">
          Open items grouped by client. Bulk actions are per-client; click through
          to act on each client&rsquo;s queue.
        </p>
      </div>

      {byClient.size === 0 && (
        <p className="rounded border border-border bg-surface-2 p-4 text-sm text-muted">
          No open escalations across clients.
        </p>
      )}

      <ul className="space-y-3">
        {Array.from(byClient.entries()).map(([clientId, rows]) => {
          const clientName = rows[0]?.client_name ?? clientId;
          return (
            <li
              key={clientId}
              className="rounded border border-border bg-surface-2 p-4 text-sm"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{clientName}</p>
                  <p className="text-xs text-muted">
                    {rows.length} open · top reason {rows[0]?.reason_code}
                  </p>
                </div>
                <Link
                  href={`/operator/clients/${clientId}/escalations`}
                  className="ui-button px-3 py-1"
                >
                  Open queue
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </AppShell>
  );
}
