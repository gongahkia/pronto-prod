import { requireUser } from "@/lib/auth";
import { getClient, getOpenEscalations } from "@/lib/dashboard";
import { AppShell } from "@/components/shell";
import { Badge } from "@/components/badge";
import { ClientNav } from "@/components/client-nav";
import { DeliveryStatusBadge } from "@/components/delivery-status";
import { EscalationOutboundStatus } from "@/components/escalation-outbound-status";

export const dynamic = "force-dynamic";

export default async function ClientEscalationsPage() {
  const user = await requireUser("client");
  if (!user.clientId) {
    throw new Error("Client user is missing a client assignment.");
  }

  const [client, escalations] = await Promise.all([
    getClient(user.clientId),
    getOpenEscalations(user.clientId),
  ]);
  if (!client) {
    throw new Error("Client record not found.");
  }

  return (
    <AppShell user={user} active="client">
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-[-0.01em]">{client.name}</h1>
        <p className="text-sm text-muted">Claim customer issues and send final replies.</p>
      </div>
      <ClientNav active="escalations" />

      <section className="ui-panel">
        <div className="ui-panel-header">
          <h2 className="text-base font-semibold">Active escalations</h2>
        </div>
        <div className="divide-y divide-line">
          {escalations.length === 0 ? (
            <p className="p-4 text-sm text-muted">No active escalations.</p>
          ) : (
            escalations.map((escalation) => (
              <div key={escalation.id} id={`escalation-${escalation.id}`} className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={escalation.status === "claimed" ? "amber" : "red"}>
                    {escalation.status}
                  </Badge>
                  <Badge tone="red">{escalation.reason_code}</Badge>
                  <DeliveryStatusBadge
                    label="customer"
                    status={escalation.customer_handoff_status}
                    error={escalation.customer_handoff_error}
                  />
                  <DeliveryStatusBadge
                    label="owner"
                    status={escalation.owner_notification_status}
                    error={escalation.owner_notification_error}
                  />
                </div>
                <div>
                  <p className="text-sm font-medium">Customer question</p>
                  <p className="mt-1 text-sm text-muted">{escalation.customer_message}</p>
                </div>
                <p className="text-sm text-muted">{escalation.reason_detail}</p>
                <EscalationOutboundStatus
                  escalationId={escalation.id}
                  outboundMessageId={escalation.owner_resolution_outbound_id}
                  status={escalation.owner_resolution_outbound_status}
                  error={escalation.owner_resolution_outbound_error}
                  attemptCount={escalation.owner_resolution_outbound_attempt_count}
                  returnTo={`/client/escalations#escalation-${escalation.id}`}
                />
                {escalation.status === "open" ? (
                  <form action="/api/escalations" method="post">
                    <input type="hidden" name="action" value="claim" />
                    <input type="hidden" name="escalationId" value={escalation.id} />
                    <input type="hidden" name="returnTo" value={`/client/escalations#escalation-${escalation.id}`} />
                    <button className="ui-button px-3 py-2">
                      Claim
                    </button>
                  </form>
                ) : null}
                {escalation.status !== "resolved" ? (
                  <form action="/api/escalations" method="post" className="space-y-2">
                    <input type="hidden" name="action" value="resolve" />
                    <input type="hidden" name="escalationId" value={escalation.id} />
                    <input type="hidden" name="returnTo" value="/client/escalations" />
                    <textarea
                      name="reply"
                      rows={3}
                      className="w-full rounded-md border border-line px-3 py-2 text-sm"
                      placeholder="Reply to customer before resolving"
                    />
                    <button className="ui-primary-button px-3 py-2">
                      Send reply and resolve
                    </button>
                  </form>
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>
    </AppShell>
  );
}
