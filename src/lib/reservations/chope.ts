import type { ReservationConnector, ReservationRequest, ConfirmedReservationRequest, ReservationResult } from "@/lib/reservations/types";

const unsupported: ReservationResult = {
  status: "unsupported", reason: "Authorized Chope reservation API access is not configured.",
};

// Chope's public affiliate page mentions API integration, but provides no
// endpoint contract. This production adapter performs no network requests.
export const chopeConnector: ReservationConnector = {
  provider: "chope",
  capabilities: { availability: false, create: false, read: false, update: false, cancel: false },
  async getAvailability(_request: ReservationRequest) { return "unknown"; },
  async createReservation(_request: ConfirmedReservationRequest) { return unsupported; },
  async getReservation(_clientId: string, _outletId: string, _reservationId: string) { return unsupported; },
  async updateReservation(_request: ConfirmedReservationRequest & { reservationId: string }) { return unsupported; },
  async cancelReservation(_request: ConfirmedReservationRequest & { reservationId: string }) { return unsupported; },
};

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
  const size = /\b(?:for|party of)\s+(\d{1,2})\b/i.exec(message);
  const time = /\b(?:at|for)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(message);
  if (!size || !time) return null;
  const partySize = Number(size[1]);
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
  if (Number.isNaN(requestedAt.getTime()) || requestedAt <= now) return null;
  return { date, time: localTime, partySize };
}

export function bookingFallback(input: {
  message: string; businessProfile: Record<string, unknown>; now?: Date;
}): { action: "link" | "escalate"; response?: string; reasonCode: string } | null {
  if (!/\b(book|reserve|reservation|table)\b/i.test(input.message)) return null;
  const request = parseRestaurantBookingRequest(input.message, input.now);
  if (!request) return { action: "escalate", reasonCode: "booking_parameters_unclear" };
  const link = approvedChopeBookingLink(input.businessProfile);
  if (!link) return { action: "escalate", reasonCode: "booking_link_unavailable" };
  return {
    action: "link", reasonCode: "chope_booking_link",
    response: `For ${request.partySize} on ${request.date} at ${request.time} Singapore time, please check availability and confirm directly with ${link.url}. I cannot confirm a reservation here.`,
  };
}
