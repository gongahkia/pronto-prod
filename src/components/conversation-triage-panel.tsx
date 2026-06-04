import { Badge } from "@/components/badge";
import { DeliveryStatusBadge } from "@/components/delivery-status";
import { EscalationOutboundStatus } from "@/components/escalation-outbound-status";
import type { EscalationWithContext } from "@/lib/dashboard";

export function ConversationTriagePanel({
  escalation,
  returnTo,
}: {
  escalation: EscalationWithContext | null;
  returnTo: string;
}) {
  return (
    <section className="ui-panel">
      <div className="ui-panel-header">
        <h2 className="text-base font-semibold">Active triage</h2>
      </div>
      {escalation ? (
        <div id={`escalation-${escalation.id}`} className="space-y-3 p-4">
          <div className="flex flex-wrap items-start gap-2">
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
            returnTo={returnTo}
          />
          {escalation.status === "open" ? (
            <form action="/api/escalations" method="post">
              <input type="hidden" name="action" value="claim" />
              <input type="hidden" name="escalationId" value={escalation.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <button className="ui-button px-3 py-2">
                Claim
              </button>
            </form>
          ) : null}
          {escalation.status !== "resolved" ? (
            <form action="/api/escalations" method="post" className="space-y-2">
              <input type="hidden" name="action" value="resolve" />
              <input type="hidden" name="escalationId" value={escalation.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <textarea
                name="reply"
                rows={4}
                className="w-full rounded-md border border-line px-3 py-2 text-sm"
                placeholder="Reply to customer before resolving"
              />
              <button className="ui-primary-button px-3 py-2">
                Send reply and resolve
              </button>
            </form>
          ) : null}
        </div>
      ) : (
        <p className="p-4 text-sm text-muted">
          No active triage is attached to this conversation.
        </p>
      )}
    </section>
  );
}
