import { resolveIntegrationCredential } from "@/lib/integrations/credentials";
import type { IntegrationCallResult, IntegrationDefinition } from "@/lib/integrations/types";

export const deliveryTrackingDefinition: IntegrationDefinition = {
  provider: "delivery_tracking",
  kind: "delivery",
  label: "3PL delivery tracking",
  description: "Read-only delivery tracking lookup against the configured 3PL JSON endpoint. The agent must never promise delivery times unless the source confirms it.",
  accessMode: "read_only",
  credentialFields: [
    { name: "api_key", label: "API key or bearer token", secret: true, required: true },
    { name: "endpoint_url", label: "Tracking endpoint URL with {tracking_number} placeholder", secret: false, required: true },
    { name: "auth_header", label: "Auth header name (default Authorization)", secret: false, required: false },
    { name: "auth_scheme", label: "Auth scheme prefix (e.g. Bearer)", secret: false, required: false },
  ],
  escalateOn: ["missing_parcel", "wrong_address", "late_delivery_promise"],
};

export type DeliveryTrackingResult = {
  tracking_number: string;
  status: string | null;
  last_event_at: string | null;
  raw: unknown;
};

export async function fetchDeliveryTracking(input: {
  clientId: string;
  trackingNumber: string;
  fetchFn?: typeof fetch;
}): Promise<IntegrationCallResult<DeliveryTrackingResult | null>> {
  const credential = await resolveIntegrationCredential({
    clientId: input.clientId,
    provider: "delivery_tracking",
  });
  if (!credential) {
    return { data: null, warning: "Delivery tracking credentials not configured." };
  }

  const endpointTemplate = stringMetadata(credential.metadata, "endpoint_url");
  if (!endpointTemplate || !endpointTemplate.includes("{tracking_number}")) {
    return {
      data: null,
      warning: "endpoint_url metadata missing or does not contain {tracking_number} placeholder.",
    };
  }

  const url = endpointTemplate.replace(
    "{tracking_number}",
    encodeURIComponent(input.trackingNumber),
  );
  const authHeader = stringMetadata(credential.metadata, "auth_header") ?? "Authorization";
  const scheme = stringMetadata(credential.metadata, "auth_scheme");
  const headerValue = scheme ? `${scheme} ${credential.apiKey}` : credential.apiKey;

  const fetchImpl = input.fetchFn ?? fetch;
  const response = await fetchImpl(url, { headers: { [authHeader]: headerValue } });

  if (response.status === 404) {
    return { data: null, warning: null };
  }
  if (!response.ok) {
    return { data: null, warning: `Delivery tracking lookup failed: HTTP ${response.status}` };
  }

  const body = (await response.json()) as Record<string, unknown>;
  return {
    data: {
      tracking_number: input.trackingNumber,
      status: pickString(body, ["status", "state", "current_status"]),
      last_event_at: pickString(body, ["last_event_at", "updated_at", "timestamp"]),
      raw: body,
    },
    warning: null,
  };
}

function stringMetadata(meta: Record<string, unknown>, key: string): string | null {
  const value = meta[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function pickString(body: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}
