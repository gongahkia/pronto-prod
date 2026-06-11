import { resolveIntegrationCredential } from "@/lib/integrations/credentials";
import type { IntegrationCallResult, IntegrationDefinition } from "@/lib/integrations/types";

export const calendlyDefinition: IntegrationDefinition = {
  provider: "calendly",
  kind: "calendar",
  label: "Calendly",
  description: "Read-only available time slots lookup. No booking mutations in v1.",
  accessMode: "read_only",
  credentialFields: [
    { name: "personal_access_token", label: "Personal access token", secret: true, required: true },
    { name: "event_type_uri", label: "Event type URI", secret: false, required: true },
  ],
  escalateOn: ["booking_create", "booking_reschedule", "booking_cancel"],
};

export type CalendlyAvailableSlot = { start_time: string; end_time: string };

export async function fetchCalendlyAvailability(input: {
  clientId: string;
  windowStart: Date;
  windowEnd: Date;
  fetchFn?: typeof fetch;
}): Promise<IntegrationCallResult<CalendlyAvailableSlot[]>> {
  const credential = await resolveIntegrationCredential({
    clientId: input.clientId,
    provider: "calendly",
  });
  if (!credential) {
    return { data: null, warning: "Calendly credentials not configured." };
  }

  const eventTypeUri = stringMetadata(credential.metadata, "event_type_uri");
  if (!eventTypeUri) {
    return { data: null, warning: "event_type_uri missing in integration metadata." };
  }

  const params = new URLSearchParams({
    event_type: eventTypeUri,
    start_time: input.windowStart.toISOString(),
    end_time: input.windowEnd.toISOString(),
  });
  const fetchImpl = input.fetchFn ?? fetch;
  const response = await fetchImpl(
    `https://api.calendly.com/event_type_available_times?${params.toString()}`,
    { headers: { Authorization: `Bearer ${credential.apiKey}` } },
  );

  if (!response.ok) {
    return {
      data: null,
      warning: `Calendly availability fetch failed: HTTP ${response.status}`,
    };
  }

  const body = (await response.json()) as { collection?: CalendlyAvailableSlot[] };
  return { data: body.collection ?? [], warning: null };
}

function stringMetadata(meta: Record<string, unknown>, key: string): string | null {
  const value = meta[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
