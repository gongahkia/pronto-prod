import { Badge } from "@/components/badge";
import type { DeliveryStatus } from "@/lib/types";

export function DeliveryStatusBadge({
  label,
  status,
  error,
}: {
  label: string;
  status: DeliveryStatus | "sending";
  error: string | null;
}) {
  return (
    <div className="space-y-1">
      <Badge tone={deliveryTone(status)}>
        {label}: {status}
      </Badge>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

function deliveryTone(status: DeliveryStatus | "sending"): "neutral" | "green" | "red" | "amber" {
  if (status === "sent") {
    return "green";
  }
  if (status === "failed") {
    return "red";
  }
  if (status === "skipped") {
    return "amber";
  }
  return "neutral";
}
