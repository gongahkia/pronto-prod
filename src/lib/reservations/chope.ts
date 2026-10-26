import type { AvailabilityResult, ReservationAvailabilityRequest, ReservationBookingLinkResult,
  ReservationCapabilities, ReservationConnector, ReservationRequest, ReservationResult } from "@/lib/reservations/types";

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

function unavailableChopeAccess(request: ReservationAvailabilityRequest): AvailabilityResult {
  return { outletId: request.outletId, date: request.date, partySize: request.partySize,
    availableSlots: [], timezone: "Asia/Singapore", provider: "chope", observedAt: null,
    status: "unknown", errorCode: validateAvailabilityRequest(request) ? "missing_authorization" : "invalid_request" };
}

const clockTime = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validateAvailabilityRequest(request: ReservationAvailabilityRequest, now = new Date()): boolean {
  if (!request.clientId || !request.outletId || !Number.isInteger(request.partySize) ||
      request.partySize < 1 || request.partySize > 20 || !/^20\d{2}-\d{2}-\d{2}$/.test(request.date) ||
      !Number.isFinite(now.getTime())) return false;
  const calendarDate = new Date(`${request.date}T00:00:00Z`);
  if (Number.isNaN(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== request.date) return false;
  if (request.time !== undefined) return clockTime.test(request.time) &&
    new Date(`${request.date}T${request.time}:00+08:00`) > now;
  // Date-only reads are valid until the end of that Singapore calendar day.
  return Date.parse(`${request.date}T00:00:00+08:00`) + 86_400_000 > now.getTime();
}

export function validateReservationRequest(request: ReservationRequest, now = new Date()): boolean {
  return typeof request.time === "string" && validateAvailabilityRequest(request, now);
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
        url.port || url.username || url.password || url.hash || url.pathname === "/" || !url.pathname) return null;
    return { outletId: value.outletId, url: url.toString(), verifiedAt: value.verifiedAt };
  } catch { return null; }
}

export type ChopeRestaurantMapping = ChopeBookingLink & { clientId: string; provider: "chope" };

// Gabriel approved this observed listing format for the POC on 25 October 2026.
// It is not an official Chope contract or a downstream checkout guarantee.
export function buildChopeListingLink(input: { mapping: ChopeRestaurantMapping;
  request: ReservationRequest; capability?: ReservationCapabilities["listingPreselection"]; now?: Date;
}): ReservationBookingLinkResult {
  const { mapping, request } = input;
  const now = input.now ?? new Date();
  if (mapping.provider !== "chope" || !mapping.clientId || mapping.clientId !== request.clientId ||
      mapping.outletId !== request.outletId || !/^[a-z0-9-]{4,80}$/i.test(mapping.outletId) ||
      !Number.isFinite(Date.parse(mapping.verifiedAt)) || Date.parse(mapping.verifiedAt) > now.getTime())
    return { status: "invalid", reasonCode: "mapping_identity_invalid" };
  // Validate the raw destination before URL normalization can hide path tricks.
  if (!/^https:\/\/www\.chope\.co\/singapore-restaurants\/restaurant\/[a-z0-9-]+\/?$/.test(mapping.url))
    return { status: "unsupported", reasonCode: "listing_format_unsupported" };
  if (!validateReservationRequest(request, now)) return { status: "invalid", reasonCode: "request_invalid" };
  if (input.capability !== "experimental_chope_listing_v1" || process.env.PRONTO_CHOPE_LISTING_LINKS_ENABLED === "0")
    return { status: "unsupported", reasonCode: "listing_preselection_disabled" };
  const url = new URL(mapping.url);
  const [hour, minute] = request.time.split(":").map(Number);
  url.searchParams.set("children", "0");
  url.searchParams.set("adults", String(request.partySize));
  url.searchParams.set("date", request.date);
  url.searchParams.set("time", `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "am" : "pm"}`);
  return { status: "preselected", provider: "chope", outletId: mapping.outletId, url: url.toString(),
    compatibility: "experimental_chope_listing_v1", downstreamPreselection: "unverified" };
}

function isAvailabilityEnquiry(message: string): boolean {
  return /\bavailability\b|\b(?:times|timings|slots|tables)\b.{0,30}\bavailable\b|\bavailable\s+(?:times|timings|slots|tables)\b/i.test(message);
}

function isBookingEnquiry(message: string): boolean {
  return /\b(book|reserve|reservation|tables?)\b/i.test(message) || isAvailabilityEnquiry(message);
}

export function parseRestaurantBookingRequest(message: string, now = new Date()):
  { date: string; time: string; partySize: number } | null {
  const request = parseRestaurantAvailabilityRequest(message, now);
  return request?.time ? { ...request, time: request.time } : null;
}

export function parseRestaurantAvailabilityRequest(message: string, now = new Date()):
  { date: string; time?: string; partySize: number } | null {
  if (!isBookingEnquiry(message)) return null;
  // The observed format supports our adults-only party input. Do not silently
  // turn an explicit child breakdown into children=0 or a smaller total party.
  if (/\b(children|child|kids?|toddlers?|infants?)\b/i.test(message)) return null;
  const size = /\b(?:for|party of)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b(?![.,]\d)/i.exec(message);
  // "Around" preserves the requested time; it does not authorize inventing
  // nearby slots. An unqualified hour ("at 7") remains ambiguous.
  const time = /\b(?:at|around|for)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(message) ??
    /\b(?:at|around|for)\s+([01]\d|2[0-3]):([0-5]\d)\b/i.exec(message);
  const explicitTime = /\b(?:at|around)\s+\d|\d{1,2}:\d|\d\s*(?:am|pm)\b/i.test(message);
  if (!size || (!time && (!isAvailabilityEnquiry(message) || explicitTime))) return null;
  const numberWords: Record<string, number> = { one: 1, two: 2, three: 3, four: 4,
    five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
    thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
    eighteen: 18, nineteen: 19, twenty: 20 };
  const partySize = numberWords[size[1].toLowerCase()] ?? Number(size[1]);
  const meridiem = time?.[3]?.toLowerCase();
  const hour = time ? (meridiem ? Number(time[1]) % 12 + (meridiem === "pm" ? 12 : 0) : Number(time[1])) : 0;
  const minute = Number(time?.[2] ?? 0);
  if (partySize < 1 || partySize > 20 ||
      (meridiem && time && (Number(time[1]) < 1 || Number(time[1]) > 12)) || minute > 59) return null;
  const singaporeDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  const dateMatch = /\b(20\d{2}-\d{2}-\d{2})\b/.exec(message);
  const date = dateMatch?.[1] ?? (/\btomorrow\b/i.test(message)
    ? new Date(Date.parse(`${singaporeDate}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)
    : /\btoday\b/i.test(message) ? singaporeDate : null);
  if (!date || !Number.isFinite(Date.parse(`${date}T00:00:00Z`))) return null;
  const localTime = time ? `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` : undefined;
  const request = { date, ...(localTime ? { time: localTime } : {}), partySize };
  if (!validateAvailabilityRequest({ clientId: "parsed", outletId: "parsed", ...request }, now)) return null;
  return request;
}

export function bookingFallback(input: {
  message: string; businessProfile: Record<string, unknown>; now?: Date;
}): { action: "link" | "escalate"; response?: string; reasonCode: string } | null {
  if (!isBookingEnquiry(input.message)) return null;
  const request = parseRestaurantAvailabilityRequest(input.message, input.now);
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
    response: `For ${request.partySize} on ${request.date}${request.time ? ` at ${request.time}` : ""} Singapore time, please check availability and confirm directly on Chope:\n${link.url}\nI cannot confirm a reservation here.`,
  };
}

type BookingAssistance = { action: "link" | "escalate"; response?: string; reasonCode: string;
  reasonDetail?: string; metadata?: Record<string, unknown> };

const MAX_OBSERVATION_AGE_MS = 5 * 60_000;
const MAX_DISPLAYED_SLOTS = 6;

export function invalidObservation(result: AvailabilityResult, request: ReservationAvailabilityRequest,
  provider: string, now: Date): "stale" | "unexpected_response" | null {
  if (!result || result.outletId !== request.outletId || result.date !== request.date ||
      result.partySize !== request.partySize || result.timezone !== "Asia/Singapore" ||
      result.provider !== provider || !Array.isArray(result.availableSlots) || result.availableSlots.length > 1440 ||
      !["available", "unavailable", "unknown", "error"].includes(result.status)) return "unexpected_response";
  if (!result.observedAt || !Number.isFinite(Date.parse(result.observedAt))) return "unexpected_response";
  const age = now.getTime() - Date.parse(result.observedAt);
  if (age < 0) return "unexpected_response";
  if (age > MAX_OBSERVATION_AGE_MS) return "stale";
  if (!result.availableSlots.every(slot => typeof slot === "string" && clockTime.test(slot) &&
      new Date(`${request.date}T${slot}:00+08:00`) > now) ||
      (result.status === "available" ? result.availableSlots.length === 0 : result.availableSlots.length > 0))
    return "unexpected_response";
  return null;
}

function relevantSlots(slots: string[], requestedTime?: string): string[] {
  const unique = [...new Set(slots)].sort();
  if (!requestedTime) return unique.slice(0, MAX_DISPLAYED_SLOTS);
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  return unique.sort((a, b) => Math.abs(minutes(a) - minutes(requestedTime)) - Math.abs(minutes(b) - minutes(requestedTime)) ||
    a.localeCompare(b)).slice(0, MAX_DISPLAYED_SLOTS).sort();
}

export async function assistWithRestaurantBooking(input: {
  clientId: string; message: string; businessProfile: Record<string, unknown>;
  now?: Date; connector?: ReservationConnector;
}): Promise<BookingAssistance | null> {
  const fallback = bookingFallback(input);
  if (!fallback || fallback.action === "escalate") return fallback;
  const connector = input.connector ?? chopeConnector;
  const parsed = parseRestaurantAvailabilityRequest(input.message, input.now);
  const link = approvedChopeBookingLink(input.businessProfile);
  if (!parsed || !link) return fallback;
  const request = { clientId: input.clientId, outletId: link.outletId, ...parsed };
  const unknown = (status: "unknown" | "error", errorCode?: string): BookingAssistance => ({ ...fallback,
    response: `${errorCode === "stale" ? "The previous availability observation is too old to use." : "I cannot verify current availability here."} ${fallback.response}`,
    metadata: { reservation: { provider: connector.provider, outletId: link.outletId, date: request.date,
      partySize: request.partySize, requestedTime: request.time ?? null, timezone: "Asia/Singapore",
      status, errorCode: errorCode ?? null, observedAt: null, displayedSlots: [], linkMode: "general" } } });
  if (!connector.capabilities.availability) return unknown("unknown", "provider_unsupported");
  try {
    const availability = await connector.getAvailability(request);
    const now = input.now ?? new Date();
    // Errors/unknown results are never an availability observation, even if they
    // accidentally contain slots. Never interpolate their payload into a reply.
    if (availability?.status === "unknown" || availability?.status === "error")
      return unknown(availability.status, availability.errorCode);
    const invalid = invalidObservation(availability, request, connector.provider, now);
    if (invalid) return unknown("unknown", invalid);
    const observed = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Singapore", year: "numeric",
      month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .format(new Date(availability.observedAt!));
    const evidence = { provider: connector.provider, outletId: link.outletId, date: request.date,
      partySize: request.partySize, requestedTime: request.time ?? null, timezone: "Asia/Singapore",
      status: availability.status, observedAt: availability.observedAt,
      observedSlots: [...new Set(availability.availableSlots)].sort() };
    const context = `${request.partySize} on ${request.date}${request.time ? ` at ${request.time}` : ""} Singapore time`;
    const confirmation = "This is not a booking. Availability can change; Chope handles final checks and confirmation. I cannot confirm a reservation here.";
    if (availability.status === "unavailable") {
      return { action: "link", reasonCode: "reservation_unavailable",
        response: `I could not find availability for ${context} when checked at ${observed} SGT. No available times were returned for that date and party size. Please check directly on Chope:\n${link.url}\n${confirmation}`,
        metadata: { reservation: { ...evidence, displayedSlots: [], linkMode: "general" } } };
    }
    const slots = relevantSlots(availability.availableSlots, request.time);
    const links = slots.map(time => buildChopeListingLink({
      mapping: { ...link, clientId: input.clientId, provider: "chope" }, request: { ...request, time },
      capability: connector.provider === "chope" ? connector.capabilities.listingPreselection : undefined, now }));
    const preselected = links.every(result => result.status === "preselected");
    const requestedAvailable = !!request.time && availability.availableSlots.includes(request.time);
    const heading = requestedAvailable ? `A table appears available for ${context}.` : request.time
      ? `${request.time} was not returned as available for ${request.partySize} on ${request.date} Singapore time. Here are observed alternatives.`
      : `For ${context}, these times were observed available.`;
    const choices = preselected ? slots.map((time, index) => `${time} — ${links[index].status === "preselected" ? links[index].url : ""}`).join("\n")
      : `${slots.join(", ")}.\nPreselection is unavailable for this link; use ${link.url} and select the date, time and party size on Chope.`;
    const compatibility = preselected
      ? `These experimental listing links request date/time/party preselection; final booking-form preselection is not guaranteed. If selections are not retained, use ${link.url} and select the details on Chope.` : "";
    const more = evidence.observedSlots.length > slots.length ? ` Showing ${slots.length} of ${evidence.observedSlots.length} observed times.` : "";
    return { action: "link", reasonCode: requestedAvailable
      ? connector.capabilities.create ? "reservation_confirmation_required" : "reservation_available_link"
      : request.time ? "reservation_available_alternatives" : "reservation_available_times",
      reasonDetail: "Customer shown a fresh scoped availability observation; final booking remains with the provider.",
      response: `${heading}\nObserved at ${observed} SGT.${more}\n${choices}\n${compatibility}\n${confirmation}`,
      metadata: { reservation: { ...evidence, displayedSlots: slots,
        linkMode: preselected ? "experimental_chope_listing_v1" : "general", downstreamPreselection: "unverified" } } };
  } catch {
    // A provider lookup failure never becomes a claim of availability.
    return unknown("error", "network_error");
  }
}
