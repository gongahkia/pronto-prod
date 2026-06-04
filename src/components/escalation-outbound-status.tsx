import { DeliveryStatusBadge } from "@/components/delivery-status";
import type { OutboundDeliveryStatus } from "@/lib/dashboard";

export function EscalationOutboundStatus({
  escalationId,
  outboundMessageId,
  status,
  error,
  attemptCount,
  returnTo,
}: {
  escalationId: string;
  outboundMessageId: string | null;
  status: OutboundDeliveryStatus | null;
  error: string | null;
  attemptCount: number | null;
  returnTo: string;
}) {
  if (!status || !outboundMessageId) {
    return null;
  }

  return (
    <div className="space-y-2 rounded-md border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <DeliveryStatusBadge label="owner reply" status={status} error={error} />
        {attemptCount ? (
          <span className="text-xs text-muted">attempts: {attemptCount}</span>
        ) : null}
      </div>
      {status === "failed" ? (
        <>
          <p className="text-sm text-danger">
            The owner reply has not been sent to the customer.
          </p>
          <form action="/api/escalations" method="post">
            <input type="hidden" name="action" value="retry_outbound" />
            <input type="hidden" name="escalationId" value={escalationId} />
            <input type="hidden" name="outboundMessageId" value={outboundMessageId} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <button className="ui-button px-3 py-2">
              Retry send
            </button>
          </form>
        </>
      ) : null}
    </div>
  );
}
