import { describe, expect, it } from "vitest";
import { FakeChopeConnector } from "../fixtures/fake-chope";
import { approvedChopeBookingLink, bookingFallback, chopeConnector,
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
      date: "2026-10-12", time: "19:00", partySize: 2 })).toBe("unknown");
  });

  it("parses Singapore local booking parameters and rejects invalid dates or party sizes", () => {
    expect(parseRestaurantBookingRequest("Can I book a table for 2 tomorrow at 7pm?", now))
      .toEqual({ date: "2026-10-12", time: "19:00", partySize: 2 });
    expect(parseRestaurantBookingRequest("Book a table for 0 tomorrow at 7pm", now)).toBeNull();
    expect(parseRestaurantBookingRequest("Book a table for 2 today at 7am", now)).toBeNull();
  });

  it("uses only an operator-verified outlet link and never claims a reservation", () => {
    const reply = bookingFallback({ message: "Can I book a table for 2 tomorrow at 7pm?",
      businessProfile: profile, now });
    expect(reply).toMatchObject({ action: "link", reasonCode: "chope_booking_link" });
    expect(reply?.response).toContain("I cannot confirm a reservation here");
    expect(bookingFallback({ message: "Can I book a table for 2 tomorrow at 7pm?",
      businessProfile: {}, now })).toMatchObject({ action: "escalate" });
    expect(approvedChopeBookingLink({ chopeBooking: { ...profile.chopeBooking,
      url: "https://evil.example/restaurant-a" } })).toBeNull();
  });

  it("fake adapter checks availability, confirmation, conflicts, idempotency, scope and unsupported mutations", async () => {
    const fake = new FakeChopeConnector("tenant-a", "restaurant-a");
    const request = { clientId: "tenant-a", outletId: "restaurant-a", date: "2026-10-12",
      time: "19:00", partySize: 2 };
    expect(await fake.getAvailability(request)).toBe("available");
    fake.availability = "unavailable";
    expect(await fake.getAvailability(request)).toBe("unavailable");
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
  });
});
