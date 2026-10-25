import { describe, expect, it, vi } from "vitest";
import { FakeChopeConnector } from "../fixtures/fake-chope";
import { approvedChopeBookingLink, assistWithRestaurantBooking, bookingFallback, chopeConnector,
  parseRestaurantBookingRequest } from "@/lib/reservations/chope";

const now = new Date("2026-10-11T12:00:00+08:00");
const profile = { chopeBooking: {
  outletId: "restaurant-a", url: "https://www.chope.co/singapore-restaurants/restaurant-a",
  verifiedAt: "2026-10-11T01:00:00Z",
} };

describe("Chope reservation capability boundary", () => {
  it("keeps production API operations unsupported until authorized access exists", async () => {
    expect(chopeConnector.capabilities).toEqual({ availability: false, create: false,
      read: false, update: false, cancel: false });
    expect(await chopeConnector.getAvailability({ clientId: "a", outletId: "restaurant-a",
      date: "2099-10-12", time: "19:00", partySize: 2 })).toMatchObject({
        status: "unknown", errorCode: "missing_authorization", availableSlots: [],
        timezone: "Asia/Singapore", provider: "chope" });
  });

  it("parses Singapore local booking parameters and rejects invalid dates or party sizes", () => {
    expect(parseRestaurantBookingRequest("Can I book a table for 2 tomorrow at 7pm?", now))
      .toEqual({ date: "2026-10-12", time: "19:00", partySize: 2 });
    expect(parseRestaurantBookingRequest("Do you have a table for two tomorrow at 7pm?", now))
      .toEqual({ date: "2026-10-12", time: "19:00", partySize: 2 });
    expect(parseRestaurantBookingRequest("Book a table for 0 tomorrow at 7pm", now)).toBeNull();
    expect(parseRestaurantBookingRequest("Book a table for 2 today at 7am", now)).toBeNull();
    expect(parseRestaurantBookingRequest("Book a table for 2 on 2026-02-31 at 7pm", now)).toBeNull();
  });

  it.each([
    ["Hi, can I reserve a table for two tomorrow around 7pm?", 2, "19:00"],
    ["Reserve a table for four tomorrow at 19:30", 4, "19:30"],
    ["Book a table for a party of twenty tomorrow around 12pm", 20, "12:00"],
    ["Reserve for 12 tomorrow at 12am", 12, "00:00"],
    ["Reserve for 1 tomorrow at 00:30", 1, "00:30"],
  ])("extracts an explicit Singapore request: %s", (message, partySize, time) => {
    expect(parseRestaurantBookingRequest(message, now))
      .toEqual({ date: "2026-10-12", time, partySize });
  });

  it.each([
    ["2026-10-25T16:30:00Z", "2026-10-27"],
    ["2026-12-31T16:30:00Z", "2027-01-02"],
    ["2028-02-28T15:30:00Z", "2028-02-29"],
  ])("resolves tomorrow from the Singapore calendar at %s", (instant, date) => {
    expect(parseRestaurantBookingRequest("Reserve for two tomorrow around 7pm", new Date(instant)))
      .toEqual({ date, time: "19:00", partySize: 2 });
  });

  it.each([
    "Reserve tomorrow at 7pm", "Reserve for two at 7pm", "Reserve for two tomorrow",
    "Reserve for two tomorrow at 7", "Reserve for 21 tomorrow at 7pm",
    "Reserve for 200 tomorrow at 7pm", "Reserve for 2.5 tomorrow at 7pm",
    "Reserve for two tomorrow at 24:00", "Reserve for two tomorrow at 13pm",
    "Reserve for two tomorrow at 7:60pm", "Reserve for two on 2026-11-31 at 7pm",
    "What time do you close tomorrow?",
  ])("does not infer missing or invalid booking parameters: %s", (message) => {
    expect(parseRestaurantBookingRequest(message, now)).toBeNull();
  });

  it("uses only an operator-verified outlet link and never claims a reservation", () => {
    const reply = bookingFallback({ message: "Can I book a table for 2 tomorrow at 7pm?",
      businessProfile: profile, now });
    expect(reply).toMatchObject({ action: "link", reasonCode: "chope_booking_link" });
    expect(reply?.response).toContain("I cannot confirm a reservation here");
    expect(bookingFallback({ message: "Can I book a table for 2 tomorrow at 7pm?",
      businessProfile: {}, now })).toMatchObject({ action: "escalate" });
    expect(bookingFallback({ message: "Can I book a table for 9 tomorrow at 7pm?",
      businessProfile: { ...profile, reservationPolicy: { manualHandoffPartySize: 9 } }, now }))
      .toMatchObject({ action: "escalate", reasonCode: "booking_group_manual_review" });
    expect(approvedChopeBookingLink({ chopeBooking: { ...profile.chopeBooking,
      url: "https://evil.example/restaurant-a" } })).toBeNull();
  });

  it("uses advertised availability only when supported and never creates a booking", async () => {
    const fake = new FakeChopeConnector("tenant-a", "restaurant-a");
    fake.now = () => now;
    const input = { clientId: "tenant-a", message: "Can I book a table for 2 tomorrow at 7pm?",
      businessProfile: profile, now, connector: fake };
    const available = await assistWithRestaurantBooking(input);
    expect(available).toMatchObject({ action: "link", reasonCode: "reservation_confirmation_required" });
    expect(available?.response).toContain("This is not a booking");
    expect(fake.reservations.size).toBe(0);
    fake.availability = "unavailable";
    expect(await assistWithRestaurantBooking(input)).toMatchObject({
      action: "link", reasonCode: "reservation_unavailable",
    });
    await expect(assistWithRestaurantBooking({ ...input, clientId: "tenant-b" }))
      .resolves.toMatchObject({ action: "link", reasonCode: "chope_booking_link" });
    fake.availability = "available";
    fake.observationAgeMs = 6 * 60_000;
    expect(await assistWithRestaurantBooking(input)).toMatchObject({ reasonCode: "chope_booking_link" });
    fake.observationAgeMs = 0;
    fake.failure = "network_error";
    expect(await assistWithRestaurantBooking(input)).toMatchObject({ reasonCode: "chope_booking_link" });
    fake.failure = "rate_limited";
    expect(await assistWithRestaurantBooking(input)).toMatchObject({ reasonCode: "chope_booking_link" });
    fake.failure = "unexpected_response";
    expect(await assistWithRestaurantBooking(input)).toMatchObject({ reasonCode: "chope_booking_link" });
    fake.failure = null;
    fake.availableSlots = ["20:00"];
    expect(await assistWithRestaurantBooking(input)).toMatchObject({ reasonCode: "chope_booking_link" });
    expect(await assistWithRestaurantBooking({ ...input, connector: chopeConnector }))
      .toMatchObject({ action: "link", reasonCode: "chope_booking_link" });
  });

  it("discards mismatched, future-dated, malformed and contradictory observations", async () => {
    const fake = new FakeChopeConnector("tenant-a", "restaurant-a");
    fake.now = () => now;
    const valid = await fake.getAvailability({ clientId: "tenant-a", outletId: "restaurant-a",
      date: "2026-10-12", time: "19:00", partySize: 2 });
    const lookup = vi.spyOn(fake, "getAvailability");
    for (const override of [
      { outletId: "restaurant-b" }, { date: "2026-10-13" }, { partySize: 4 },
      { provider: "another-provider" }, { timezone: "UTC" },
      { observedAt: null }, { observedAt: "invalid" }, { observedAt: "2026-10-12T00:00:00Z" },
      { availableSlots: ["25:00", "19:00"] }, { status: "unavailable", availableSlots: ["19:00"] },
    ]) {
      lookup.mockResolvedValue({ ...valid, ...override } as typeof valid);
      const result = await assistWithRestaurantBooking({ clientId: "tenant-a",
        message: "Reserve for two tomorrow around 7pm", businessProfile: profile, now,
        connector: fake });
      expect(result?.reasonCode).toBe("chope_booking_link");
      expect(result?.response).not.toContain("appears available");
      // Exact links remain unverified. Preserve the pre-existing outlet URL;
      // never synthesize date/time/party query parameters from a fake result.
      expect(result?.response).toContain(profile.chopeBooking.url);
      expect(result?.response).not.toMatch(/[?&](?:date|time|adults|partySize)=/);
    }
    lookup.mockRestore();
  });

  it("keeps missing parameters and missing outlet authorization on the human path", async () => {
    const fake = new FakeChopeConnector("tenant-a", "restaurant-a");
    expect(await assistWithRestaurantBooking({ clientId: "tenant-a", message: "Reserve for two tomorrow",
      businessProfile: profile, now, connector: fake }))
      .toMatchObject({ action: "escalate", reasonCode: "booking_parameters_unclear" });
    expect(await assistWithRestaurantBooking({ clientId: "tenant-a", message: "Reserve for two tomorrow around 7pm",
      businessProfile: {}, now, connector: fake }))
      .toMatchObject({ action: "escalate", reasonCode: "booking_link_unavailable" });
    expect(fake.reservations.size).toBe(0);
  });

  it("fake adapter checks availability, confirmation, conflicts, idempotency, scope and unsupported mutations", async () => {
    const fake = new FakeChopeConnector("tenant-a", "restaurant-a");
    fake.now = () => now;
    const request = { clientId: "tenant-a", outletId: "restaurant-a", date: "2026-10-12",
      time: "19:00", partySize: 2 };
    expect(await fake.getAvailability(request)).toMatchObject({ status: "available", availableSlots: ["19:00"] });
    expect(await fake.getAvailability({ ...request, date: "2026-02-31" }))
      .toMatchObject({ status: "error", errorCode: "invalid_request" });
    fake.availability = "unavailable";
    expect(await fake.getAvailability(request)).toMatchObject({ status: "unavailable", availableSlots: [] });
    const confirmed = { ...request, customerName: "Tester", customerContact: "test@example.invalid",
      customerConfirmed: true as const, idempotencyKey: "request-a" };
    expect(await fake.createReservation(confirmed)).toMatchObject({ status: "conflict" });
    fake.availability = "available";
    const first = await fake.createReservation(confirmed);
    expect(first).toMatchObject({ status: "confirmed", providerReservationId: "fake-request-a" });
    expect(await fake.createReservation(confirmed)).toEqual(first);
    expect(fake.reservations.size).toBe(1);
    expect(await fake.createReservation({ ...confirmed, customerConfirmed: false as true }))
      .toMatchObject({ status: "unsupported" });
    await expect(fake.getAvailability({ ...request, clientId: "tenant-b" })).rejects.toThrow(/tenant/);
    expect(await fake.updateReservation({ ...confirmed, reservationId: "fake-request-a" }))
      .toMatchObject({ status: "unsupported" });
    fake.failAfterAcceptance = true;
    expect(await fake.createReservation({ ...confirmed, idempotencyKey: "request-b" }))
      .toMatchObject({ status: "ambiguous" });
    expect(fake.reservations.size).toBe(2);
    expect(await chopeConnector.createReservation(confirmed)).toMatchObject({ status: "unsupported" });
  });
});
