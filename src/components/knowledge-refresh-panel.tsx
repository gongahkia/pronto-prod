import type { KnowledgeRefreshRequest } from "@/lib/types";
import { formatDate as formatDisplayDate } from "@/lib/date-format";
import { Badge } from "@/components/badge";

export function KnowledgeRefreshPanel({
  requests,
  action,
  clientId,
}: {
  requests: KnowledgeRefreshRequest[];
  action: string;
  clientId?: string;
}) {
  const openRequests = requests.filter((request) => request.status === "open");

  return (
    <section className="ui-panel">
      <div className="ui-panel-header">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Knowledge refresh</h2>
            <p className="text-sm text-muted">
              Track monthly policy checks before the assistant answers from stale source material.
            </p>
          </div>
          <Badge tone={openRequests.length ? "amber" : "green"}>
            {openRequests.length} open
          </Badge>
        </div>
      </div>

      <div className="divide-y divide-line">
        {requests.length ? (
          requests.map((request) => (
            <div key={request.id} className="space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={request.status === "open" ? "amber" : "green"}>
                      {request.status}
                    </Badge>
                    <p className="text-sm font-medium">{request.cadence}</p>
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    Due {formatDate(request.due_at)}
                    {request.completed_at
                      ? ` · completed ${formatDate(request.completed_at)}`
                      : ""}
                  </p>
                </div>
                {request.status === "open" ? (
                  <div className="flex flex-wrap gap-2">
                    <ResolveRefreshForm
                      action={action}
                      clientId={clientId}
                      requestId={request.id}
                      status="completed"
                      label="Mark reviewed"
                    />
                    <ResolveRefreshForm
                      action={action}
                      clientId={clientId}
                      requestId={request.id}
                      status="skipped"
                      label="Skip"
                    />
                  </div>
                ) : null}
              </div>
              {request.notes ? (
                <p className="rounded-md border border-line bg-surface-subtle p-3 text-sm text-muted">
                  {request.notes}
                </p>
              ) : null}
            </div>
          ))
        ) : (
          <p className="p-4 text-sm text-muted">No refresh checks have been scheduled yet.</p>
        )}
      </div>

      <form action={action} method="post" className="space-y-3 border-t border-line p-4">
        <input type="hidden" name="action" value="create" />
        {clientId ? <input type="hidden" name="clientId" value={clientId} /> : null}
        <textarea
          name="notes"
          rows={3}
          className="w-full rounded-md border border-line px-3 py-2 text-sm"
          placeholder="Optional check-in notes"
        />
        <button className="ui-button px-4 py-2">
          Schedule monthly refresh
        </button>
      </form>
    </section>
  );
}

function ResolveRefreshForm({
  action,
  clientId,
  requestId,
  status,
  label,
}: {
  action: string;
  clientId?: string;
  requestId: string;
  status: "completed" | "skipped";
  label: string;
}) {
  return (
    <form action={action} method="post">
      <input type="hidden" name="action" value="resolve" />
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="status" value={status} />
      {clientId ? <input type="hidden" name="clientId" value={clientId} /> : null}
      <button className="ui-button px-3 py-1.5 text-xs">
        {label}
      </button>
    </form>
  );
}

function formatDate(value: Date): string {
  return formatDisplayDate(value);
}
