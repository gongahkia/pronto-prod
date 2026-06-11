import { resolveIntegrationCredential } from "@/lib/integrations/credentials";
import type { IntegrationCallResult, IntegrationDefinition } from "@/lib/integrations/types";

export const googleCalendarDefinition: IntegrationDefinition = {
  provider: "google_calendar",
  kind: "calendar",
  label: "Google Calendar",
  description: "Read-only free/busy availability lookup. No booking mutations in v1.",
  accessMode: "read_only",
  credentialFields: [
    { name: "access_token", label: "OAuth access token", secret: true, required: true },
    { name: "calendar_id", label: "Calendar ID", secret: false, required: true },
  ],
  escalateOn: ["booking_create", "booking_modify", "booking_cancel"],
};

export type CalendarBusySlot = { start: string; end: string };

export async function fetchGoogleCalendarBusy(input: {
  clientId: string;
  windowStart: Date;
  windowEnd: Date;
  fetchFn?: typeof fetch;
}): Promise<IntegrationCallResult<CalendarBusySlot[]>> {
  const credential = await resolveIntegrationCredential({
    clientId: input.clientId,
    provider: "google_calendar",
  });
  if (!credential) {
    return { data: null, warning: "Google Calendar credentials not configured." };
  }

  const calendarId = stringMetadata(credential.metadata, "calendar_id");
  if (!calendarId) {
    return { data: null, warning: "calendar_id missing in integration metadata." };
  }

  const fetchImpl = input.fetchFn ?? fetch;
  const response = await fetchImpl("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${credential.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin: input.windowStart.toISOString(),
      timeMax: input.windowEnd.toISOString(),
      items: [{ id: calendarId }],
    }),
  });

  if (!response.ok) {
    return {
      data: null,
      warning: `Google Calendar freeBusy failed: HTTP ${response.status}`,
    };
  }

  const body = (await response.json()) as {
    calendars?: Record<string, { busy?: CalendarBusySlot[] }>;
  };
  const slots = body.calendars?.[calendarId]?.busy ?? [];
  return { data: slots, warning: null };
}

function stringMetadata(meta: Record<string, unknown>, key: string): string | null {
  const value = meta[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
