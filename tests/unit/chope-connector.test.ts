import { describe, expect, it } from "vitest";
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
