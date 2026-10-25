import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { approvedChopeBookingLink, assistWithRestaurantBooking, buildChopeListingLink,
  parseRestaurantAvailabilityRequest, validateAvailabilityRequest } from "@/lib/reservations/chope";
import { createChopeBrowserConnector } from "@/lib/reservations/chope-browser";
import type { AvailabilityResult, ReservationRequest } from "@/lib/reservations/types";

const now = new Date("2026-10-25T04:00:00Z");
const listing = "https://www.chope.co/singapore-restaurants/restaurant/ps-cafe-raffles-city";
const mapping = { clientId: "tenant-a", provider: "chope" as const, outletId: "pscaferafflescity1808psc",
  url: listing, verifiedAt: "2026-10-11T00:00:00Z" };
const request = { clientId: mapping.clientId, outletId: mapping.outletId, date: "2026-10-26", time: "10:15", partySize: 2 };
const profile = { chopeBooking: mapping };
const capability = "experimental_chope_listing_v1" as const;
const build = (overrides: Partial<ReservationRequest> = {}) => buildChopeListingLink({ mapping, request: { ...request, ...overrides }, capability, now });

function fixture(overrides: Partial<AvailabilityResult> = {}) {
  const observation: AvailabilityResult = { outletId: mapping.outletId, date: request.date, partySize: 2,
    availableSlots: ["18:30", "19:00", "19:30"], timezone: "Asia/Singapore", provider: "chope",
    observedAt: now.toISOString(), status: "available", ...overrides };
  const read = vi.fn(async () => observation);
  const connector = createChopeBrowserConnector({ clientId: mapping.clientId, outletId: mapping.outletId,
    listingUrl: listing, authorizedAt: mapping.verifiedAt, scope: "demo_availability" }, read);
  return { connector, read };
}
const assist = (connector: ReturnType<typeof fixture>["connector"], message = "What timings are available tomorrow for two people?") =>
  assistWithRestaurantBooking({ clientId: mapping.clientId, message, businessProfile: profile, now, connector });
const urls = (text = "") => text.match(/https:\/\/[^\s]+/g) ?? [];
const preselectedUrls = (text = "") => urls(text).filter(url => new URL(url).searchParams.has("time"));

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("experimental Chope native listing links", () => {
  it("matches the historical native encoding while preserving verified provider and outlet", () => {
    expect(build()).toEqual({ status: "preselected", provider: "chope", outletId: mapping.outletId,
      compatibility: capability, downstreamPreselection: "unverified",
      url: `${listing}?children=0&adults=2&date=2026-10-26&time=10%3A15+am` });
  });
  it.each([["00:00", "12:00 am"], ["12:00", "12:00 pm"], ["19:05", "7:05 pm"], ["23:59", "11:59 pm"]])(
    "converts %s to the observed 12-hour value %s", (time, native) => {
      const result = build({ time, partySize: 4 }); expect(result.status).toBe("preselected");
      if (result.status === "preselected") {
        const query = new URL(result.url).searchParams;
        expect(Object.fromEntries(query)).toEqual({ children: "0", adults: "4", date: request.date, time: native });
      }
    });
  it.each([
    { date: "2026-02-31" }, { date: "2026-2-01" }, { date: "2026-10-24" }, { date: "2026-10-26&adults=8" },
    { time: "24:00" }, { time: "19:60" }, { time: "7pm" }, { time: "19:00&rid=other" },
    { partySize: 0 }, { partySize: 21 }, { partySize: 2.5 }, { partySize: Number.NaN },
    { partySize: "2" as unknown as number }, { clientId: "foreign-tenant" }, { outletId: "foreign-outlet" },
  ])("rejects invalid selection/scope %j", override => { expect(build(override).status).toBe("invalid"); });
  it.each([
    "https://evil.example/restaurant/ps-cafe-raffles-city", "https://www.chope.co.evil.example/restaurant/a",
    "http://www.chope.co/singapore-restaurants/restaurant/a", "https://user:password@www.chope.co/singapore-restaurants/restaurant/a",
    `${listing}:8443`, "https://www.chope.co:8443/singapore-restaurants/restaurant/a", `${listing}?rid=other`, `${listing}#redirect`,
    "https://www.chope.co/singapore-restaurants/restaurant/%2e%2e/other", "https://www.chope.co/singapore-restaurants/restaurant/../other",
    "https://www.chope.co/booking/check", "https://book.chope.co/booking?rid=pscaferafflescity1808psc",
    "https://www.chope.co/singapore-restaurants/restaurant/a\n", `${listing}%3Fdate=2026-10-26`,
  ])("never constructs preselection for an untrusted or unsupported destination: %s", url => {
    const result = buildChopeListingLink({ mapping: { ...mapping, url }, request, capability, now });
    expect(result.status).not.toBe("preselected"); expect(result).not.toHaveProperty("url");
  });
  it("requires a verified identity and capability and supports immediate safe disablement", () => {
    expect(buildChopeListingLink({ mapping, request, now })).toMatchObject({ status: "unsupported" });
    expect(buildChopeListingLink({ mapping: { ...mapping, verifiedAt: "invalid" }, request, capability, now })).toMatchObject({ status: "invalid" });
    expect(buildChopeListingLink({ mapping: { ...mapping, verifiedAt: "2026-10-27T00:00:00Z" }, request, capability, now })).toMatchObject({ status: "invalid" });
    vi.stubEnv("PRONTO_CHOPE_LISTING_LINKS_ENABLED", "0"); expect(build()).toMatchObject({ status: "unsupported" });
    expect(approvedChopeBookingLink({ chopeBooking: { ...mapping, url: "https://evil.example/a" } })).toBeNull();
  });
});

describe("availability dialogue and grounded slot links", () => {
  it("parses date/party availability without inventing a requested time", async () => {
    expect(parseRestaurantAvailabilityRequest("What timings are available tomorrow for two people?", now))
      .toEqual({ date: request.date, partySize: 2 });
    const { connector, read } = fixture(); const result = await assist(connector);
    expect(read).toHaveBeenCalledWith({ clientId: mapping.clientId, outletId: mapping.outletId, date: request.date, partySize: 2 }, expect.anything());
    expect(result).toMatchObject({ reasonCode: "reservation_available_times" });
    expect(preselectedUrls(result?.response).map(url => new URL(url).searchParams.get("time")))
      .toEqual(["6:30 pm", "7:00 pm", "7:30 pm"]);
    expect(result?.response).toContain("25/10/2026, 12:00:00 SGT");
    expect(result?.response).toContain("experimental listing links");
    expect(result?.response).toContain("final booking-form preselection is not guaranteed");
    expect(result?.response).toContain("This is not a booking");
  });
  it("offers only observed alternatives when the requested time is absent", async () => {
    const { connector } = fixture({ availableSlots: ["19:30", "18:30", "19:30"] });
    const result = await assist(connector, "Can I reserve a table for two tomorrow around 7pm?");
    expect(result?.reasonCode).toBe("reservation_available_alternatives");
    expect(result?.response).toContain("19:00 was not returned as available");
    expect(preselectedUrls(result?.response)).toHaveLength(2);
    expect(preselectedUrls(result?.response).some(url => new URL(url).searchParams.get("time") === "7:00 pm")).toBe(false);
    expect(result?.metadata).toMatchObject({ reservation: { observedSlots: ["18:30", "19:30"], displayedSlots: ["18:30", "19:30"] } });
  });
  it("keeps the requested observed slot among six relevant choices without extrapolation", async () => {
    const slots = ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "19:00", "20:00"];
    const result = await assist(fixture({ availableSlots: slots }).connector, "Reserve for two tomorrow at 7pm");
    expect(preselectedUrls(result?.response)).toHaveLength(6);
    expect(result?.response).toContain("Showing 6 of 8 observed times");
    expect(result?.metadata).toMatchObject({ reservation: { displayedSlots: ["12:00", "13:00", "14:00", "15:00", "19:00", "20:00"] } });
  });
  it.each([
    { status: "unavailable", availableSlots: [] }, { status: "unknown", availableSlots: ["19:00"] },
    { status: "error", errorCode: "provider_timeout" }, { observedAt: "2026-10-25T03:54:59Z" },
    { observedAt: "2026-10-25T04:00:01Z" }, { observedAt: null }, { outletId: "foreign-outlet" },
    { partySize: 4 }, { date: "2026-10-27" }, { provider: "untrusted" }, { timezone: "UTC" },
    { availableSlots: ["19:00", "25:00"] }, { status: "available", availableSlots: [] },
    { status: "unavailable", availableSlots: ["19:00"] }, { status: "unexpected" },
  ])("does not manufacture slot links from an unusable observation %j", async override => {
    const result = await assist(fixture(override as Partial<AvailabilityResult>).connector);
    expect(preselectedUrls(result?.response)).toEqual([]);
    expect(result?.response).toContain(listing); expect(result?.response).not.toContain("A table appears available");
  });
  it("uses the general link with an explanation for provider failure, unsupported capability or disabled preselection", async () => {
    const { connector, read } = fixture(); read.mockRejectedValueOnce(new Error("private provider payload"));
    const failure = await assist(connector); expect(failure?.response).toContain("cannot verify current availability");
    expect(failure?.response).not.toContain("private provider payload");
    const unsupported = await assist({ ...connector, capabilities: { ...connector.capabilities, availability: false } });
    expect(unsupported?.response).toContain("cannot verify current availability");
    for (const mode of ["capability", "kill-switch"]) {
      if (mode === "kill-switch") vi.stubEnv("PRONTO_CHOPE_LISTING_LINKS_ENABLED", "0");
      const result = await assist(mode === "capability" ? { ...connector, capabilities: { ...connector.capabilities, listingPreselection: undefined } } : connector);
      expect(preselectedUrls(result?.response)).toEqual([]);
      expect(result?.response).toContain("Preselection is unavailable"); expect(result?.response).toContain(listing);
    }
  });
  it("rejects cross-tenant scope before reading and preserves human/group policy boundaries", async () => {
    const { connector, read } = fixture();
    expect(await assistWithRestaurantBooking({ clientId: "foreign-tenant", message: "What timings are available tomorrow for two?", businessProfile: profile, connector, now }))
      .toMatchObject({ reasonCode: "chope_booking_link" });
    expect(read).not.toHaveBeenCalled();
    expect(await assistWithRestaurantBooking({ clientId: mapping.clientId, message: "What timings are available tomorrow for two?", businessProfile: {}, connector, now }))
      .toMatchObject({ action: "escalate", reasonCode: "booking_link_unavailable" });
    expect(await assistWithRestaurantBooking({ clientId: mapping.clientId, message: "What timings are available tomorrow for nine?",
      businessProfile: { ...profile, reservationPolicy: { manualHandoffPartySize: 9 } }, connector, now }))
      .toMatchObject({ action: "escalate", reasonCode: "booking_group_manual_review" });
    expect(read).not.toHaveBeenCalled();
  });
  it("does not call reservation operations even if a connector advertises writes", async () => {
    const { connector } = fixture();
    const forbidden = vi.fn(() => { throw new Error("Reservation writes are forbidden"); });
    await assist({ ...connector, capabilities: { ...connector.capabilities, create: true },
      createReservation: forbidden, getReservation: forbidden, updateReservation: forbidden, cancelReservation: forbidden });
    expect(forbidden).not.toHaveBeenCalled();
  });
  it("handles Singapore date rollover and rejects incomplete or malformed availability requests", () => {
    expect(parseRestaurantAvailabilityRequest("Any availability tomorrow for four?", new Date("2026-12-31T16:30:00Z")))
      .toEqual({ date: "2027-01-02", partySize: 4 });
    for (const text of ["Any availability tomorrow?", "Any availability for two?", "Available times tomorrow for two at 7",
      "Available times tomorrow for two at 24:00", "Available times on 2026-02-31 for two?", "What dishes are available tomorrow for two?",
      "Any available times tomorrow for 2 adults and 1 child?"])
      expect(parseRestaurantAvailabilityRequest(text, now)).toBeNull();
    expect(validateAvailabilityRequest({ ...request, time: undefined, date: "2026-10-25" }, now)).toBe(true);
    expect(validateAvailabilityRequest({ ...request, time: undefined, date: "2026-10-24" }, now)).toBe(false);
  });
});
