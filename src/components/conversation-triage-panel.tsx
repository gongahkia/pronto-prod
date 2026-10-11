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
        <h2 className="text-base font-semibold">Your next action</h2>
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
          <p className="text-sm text-muted">Pronto handed this conversation to your team: {escalation.reason_detail}</p>
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
                required
                className="w-full rounded-md border border-line px-3 py-2 text-sm"
                placeholder="Write the reply the customer will receive"
              />
              <button className="ui-primary-button px-3 py-2">
                Send reply and resolve
              </button>
            </form>
          ) : null}
          {escalation.status !== "resolved" ? (
            <details className="rounded-md border border-line p-3 text-sm">
              <summary className="cursor-pointer font-medium">Resolve without sending a reply</summary>
              <p className="my-2 text-muted">Use this only when the customer has already been helped elsewhere.</p>
              <form action="/api/escalations" method="post">
                <input type="hidden" name="action" value="resolve" />
                <input type="hidden" name="escalationId" value={escalation.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <button className="ui-button px-3 py-2">Confirm resolution</button>
              </form>
            </details>
          ) : null}
        </div>
      ) : (
        <p className="p-4 text-sm text-muted">
          No reply is needed right now. You can review the conversation here.
        </p>
      )}
    </section>
  );
}
