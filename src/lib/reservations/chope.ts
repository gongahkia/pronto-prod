import type { AvailabilityResult, ReservationConnector, ReservationRequest, ReservationResult } from "@/lib/reservations/types";

const unsupported: ReservationResult = {
  status: "unsupported", reason: "Authorized Chope reservation API access is not configured.",
};

// Chope's public affiliate page mentions API integration, but provides no
// endpoint contract. This production adapter performs no network requests.
export const chopeConnector: ReservationConnector = {
  provider: "chope",
  capabilities: { availability: false, create: false, read: false, update: false, cancel: false },
  async getAvailability(request) { return unavailableChopeAccess(request); },
  async createReservation() { return unsupported; },
  async getReservation() { return unsupported; },
  async updateReservation() { return unsupported; },
  async cancelReservation() { return unsupported; },
};

function unavailableChopeAccess(request: ReservationRequest): AvailabilityResult {
  return { outletId: request.outletId, date: request.date, partySize: request.partySize,
    availableSlots: [], timezone: "Asia/Singapore", provider: "chope", observedAt: null,
    status: "unknown", errorCode: validateReservationRequest(request) ? "missing_authorization" : "invalid_request" };
}

export function validateReservationRequest(request: ReservationRequest, now = new Date()): boolean {
  if (!request.clientId || !request.outletId || !Number.isInteger(request.partySize) ||
      request.partySize < 1 || request.partySize > 20 || !/^20\d{2}-\d{2}-\d{2}$/.test(request.date) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(request.time)) return false;
  const calendarDate = new Date(`${request.date}T00:00:00Z`);
  if (Number.isNaN(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== request.date) return false;
  const requestedAt = new Date(`${request.date}T${request.time}:00+08:00`);
  return requestedAt > now;
}

export type ChopeBookingLink = { outletId: string; url: string; verifiedAt: string };

export function approvedChopeBookingLink(profile: Record<string, unknown>): ChopeBookingLink | null {
  const booking = profile.chopeBooking;
  if (!booking || typeof booking !== "object" || Array.isArray(booking)) return null;
  const value = booking as Record<string, unknown>;
  if (typeof value.outletId !== "string" || !value.outletId.trim() ||
      typeof value.url !== "string" || typeof value.verifiedAt !== "string" ||
      !Number.isFinite(Date.parse(value.verifiedAt))) return null;
  try {
    const url = new URL(value.url);
    if (url.protocol !== "https:" || !["www.chope.co", "chope.co", "book.chope.co"].includes(url.hostname) ||
        url.username || url.password || url.pathname === "/" || !url.pathname) return null;
    return { outletId: value.outletId, url: url.toString(), verifiedAt: value.verifiedAt };
  } catch { return null; }
}

export function parseRestaurantBookingRequest(message: string, now = new Date()):
  { date: string; time: string; partySize: number } | null {
  if (!/\b(book|reserve|reservation|table)\b/i.test(message)) return null;
  const size = /\b(?:for|party of)\s+(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.exec(message);
  const time = /\b(?:at|for)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(message);
  if (!size || !time) return null;
  const numberWords: Record<string, number> = { one: 1, two: 2, three: 3, four: 4,
    five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const partySize = numberWords[size[1].toLowerCase()] ?? Number(size[1]);
  const hour = Number(time[1]) % 12 + (time[3].toLowerCase() === "pm" ? 12 : 0);
  const minute = Number(time[2] ?? 0);
  if (partySize < 1 || partySize > 20 || Number(time[1]) < 1 || Number(time[1]) > 12 || minute > 59) return null;
  const singaporeDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  const dateMatch = /\b(20\d{2}-\d{2}-\d{2})\b/.exec(message);
  const date = dateMatch?.[1] ?? (/\btomorrow\b/i.test(message)
    ? new Date(Date.parse(`${singaporeDate}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)
    : /\btoday\b/i.test(message) ? singaporeDate : null);
  if (!date || !Number.isFinite(Date.parse(`${date}T00:00:00Z`))) return null;
  const localTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const requestedAt = new Date(`${date}T${localTime}:00+08:00`);
  if (Number.isNaN(requestedAt.getTime()) || requestedAt <= now ||
      !validateReservationRequest({ clientId: "parsed", outletId: "parsed", date, time: localTime, partySize }, now)) return null;
  return { date, time: localTime, partySize };
}

export function bookingFallback(input: {
  message: string; businessProfile: Record<string, unknown>; now?: Date;
}): { action: "link" | "escalate"; response?: string; reasonCode: string } | null {
  if (!/\b(book|reserve|reservation|table)\b/i.test(input.message)) return null;
  const request = parseRestaurantBookingRequest(input.message, input.now);
  if (!request) return { action: "escalate", reasonCode: "booking_parameters_unclear" };
  const policy = input.businessProfile.reservationPolicy;
  if (policy && typeof policy === "object" && !Array.isArray(policy)) {
    const threshold = (policy as Record<string, unknown>).manualHandoffPartySize;
    if (typeof threshold === "number" && Number.isInteger(threshold) && threshold >= 1 &&
        threshold <= 20 && request.partySize >= threshold) {
      return { action: "escalate", reasonCode: "booking_group_manual_review" };
    }
  }
  const link = approvedChopeBookingLink(input.businessProfile);
  if (!link) return { action: "escalate", reasonCode: "booking_link_unavailable" };
  return {
    action: "link", reasonCode: "chope_booking_link",
    response: `For ${request.partySize} on ${request.date} at ${request.time} Singapore time, please check availability and confirm directly with ${link.url}. I cannot confirm a reservation here.`,
  };
}

export async function assistWithRestaurantBooking(input: {
  clientId: string; message: string; businessProfile: Record<string, unknown>;
  now?: Date; connector?: ReservationConnector;
}): Promise<{ action: "link" | "escalate"; response?: string; reasonCode: string } | null> {
  const fallback = bookingFallback(input);
  if (!fallback || fallback.action === "escalate") return fallback;
  const connector = input.connector ?? chopeConnector;
  if (!connector.capabilities.availability) return fallback;
  const request = parseRestaurantBookingRequest(input.message, input.now);
  const link = approvedChopeBookingLink(input.businessProfile);
  if (!request || !link) return fallback;
  try {
    const availability = await connector.getAvailability({
      clientId: input.clientId, outletId: link.outletId, ...request,
    });
    const fresh = availability.observedAt !== null && Number.isFinite(Date.parse(availability.observedAt)) &&
      Date.parse(availability.observedAt) <= (input.now ?? new Date()).getTime() &&
      (input.now ?? new Date()).getTime() - Date.parse(availability.observedAt) <= 5 * 60_000;
    if (!fresh || availability.outletId !== link.outletId || availability.date !== request.date ||
        availability.partySize !== request.partySize || availability.timezone !== "Asia/Singapore" ||
        availability.provider !== connector.provider) return fallback;
    if (availability.status === "unavailable") {
      return { action: "link", reasonCode: "reservation_unavailable",
        response: `I could not find availability for ${request.partySize} on ${request.date} at ${request.time} Singapore time. You can check other times and confirm directly with ${link.url}. I cannot confirm a reservation here.` };
    }
    if (availability.status === "available" && availability.availableSlots.includes(request.time)) {
      return { action: "link", reasonCode: connector.capabilities.create
        ? "reservation_confirmation_required" : "reservation_available_link",
        response: `A table appears available for ${request.partySize} on ${request.date} at ${request.time} Singapore time. This is not a booking. Please confirm directly with ${link.url}. I cannot confirm a reservation here.` };
    }
  } catch {
    // A provider lookup failure never becomes a claim of availability.
  }
  return fallback;
}
