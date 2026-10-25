import { afterEach, describe, expect, it, vi } from "vitest";
import { configuredChopeBrowserConnector, createChopeBrowserConnector,
  parseChopeTimeOptions, readChopeBrowserAvailability,
  validChopeBrowserConfig } from "@/lib/reservations/chope-browser";

const config = { clientId: "tenant-a", outletId: "restaurant-a",
  listingUrl: "https://www.chope.co/singapore-restaurants/restaurant/restaurant-a",
  authorizedAt: "2026-10-11T00:00:00Z", scope: "demo_availability" as const };
const request = { clientId: "tenant-a", outletId: "restaurant-a", date: "2099-10-12",
  time: "19:00", partySize: 2 };

afterEach(() => { delete process.env.PRONTO_CHOPE_LIVE_READS;
  delete process.env.CHOPE_LIVE_READ_APPROVED; });

describe("Chope browser availability boundary", () => {
  it("requires a tenant-scoped, explicit demo setting and an approved matching link", () => {
    const profile = { chopeBooking: { outletId: config.outletId, url: config.listingUrl,
      verifiedAt: config.authorizedAt }, chopeAvailability: { enabled: true, mode: "browser",
      scope: config.scope, outletId: config.outletId, listingUrl: config.listingUrl,
      authorizedAt: config.authorizedAt } };
    expect(configuredChopeBrowserConnector(config.clientId, profile)).toBeNull();
    process.env.PRONTO_CHOPE_LIVE_READS = "1";
    expect(configuredChopeBrowserConnector(config.clientId, profile)).toBeNull();
    process.env.CHOPE_LIVE_READ_APPROVED = "1";
    expect(configuredChopeBrowserConnector(config.clientId, profile)?.capabilities)
      .toEqual({ availability: true, create: false, read: false, update: false, cancel: false });
    expect(configuredChopeBrowserConnector(config.clientId, { ...profile,
      chopeAvailability: { ...profile.chopeAvailability, enabled: false } })).toBeNull();
    expect(configuredChopeBrowserConnector(config.clientId, { ...profile,
      chopeBooking: { ...profile.chopeBooking, outletId: "another" } })).toBeNull();
    expect(validChopeBrowserConfig({ ...config, listingUrl: "https://evil.example/restaurant-a" }))
      .toBe(false);
    expect(validChopeBrowserConfig({ ...config, listingUrl: `${config.listingUrl}?token=secret` }))
      .toBe(false);
    expect(validChopeBrowserConfig({ ...config, listingUrl: config.listingUrl.replace(
      "www.chope.co", "www.chope.co:8443") })).toBe(false);
    expect(validChopeBrowserConfig({ ...config, listingUrl: config.listingUrl.replace(
      "www.chope.co", "localhost") })).toBe(false);
  });

  it("fails closed before launching a browser without both live-read opt-ins", async () => {
    expect(await readChopeBrowserAvailability(request, config)).toMatchObject({
      status: "error", errorCode: "missing_authorization" });
    process.env.PRONTO_CHOPE_LIVE_READS = "1";
    expect(await readChopeBrowserAvailability(request, config)).toMatchObject({
      status: "error", errorCode: "missing_authorization" });
  });

  it("parses selectable Singapore times and treats malformed options as failure", () => {
    expect(parseChopeTimeOptions([
      { value: "10:00am", text: "10:00am", disabled: false },
      { value: "7:00pm", text: "7:00pm", disabled: false },
    ])).toEqual({ status: "available", slots: ["10:00", "19:00"] });
    expect(parseChopeTimeOptions([{ value: "Not Available", text: "Not Available",
      disabled: false }])).toEqual({ status: "unavailable", slots: [] });
    expect(parseChopeTimeOptions([{ value: "unexpected", text: "unexpected",
      disabled: false }])).toEqual({ status: "error", slots: [] });
    expect(parseChopeTimeOptions([])).toEqual({ status: "error", slots: [] });
    expect(parseChopeTimeOptions([
      { value: "Not Available", text: "Not Available", disabled: false },
      { value: "7:00pm", text: "7:00pm", disabled: false },
    ])).toEqual({ status: "error", slots: [] });
    expect(parseChopeTimeOptions([
      { value: "7:00pm", text: "7:00pm", disabled: true },
      { value: "", text: "Select time", disabled: false },
    ])).toEqual({ status: "error", slots: [] });
  });

  it("checks tenant, outlet and parameters before the injected read; keeps writes unsupported", async () => {
    const reader = vi.fn(async () => ({ outletId: request.outletId, date: request.date,
      partySize: request.partySize, availableSlots: ["19:00"], timezone: "Asia/Singapore" as const,
      provider: "chope", observedAt: new Date().toISOString(), status: "available" as const }));
    const connector = createChopeBrowserConnector(config, reader);
    expect(await connector.getAvailability(request)).toMatchObject({ status: "available",
      availableSlots: ["19:00"] });
    expect(await connector.getAvailability({ ...request, clientId: "tenant-b" }))
      .toMatchObject({ status: "error", errorCode: "missing_authorization" });
    expect(await connector.getAvailability({ ...request, outletId: "restaurant-b" }))
      .toMatchObject({ status: "error", errorCode: "missing_authorization" });
    expect(await connector.getAvailability({ ...request, partySize: 0 }))
      .toMatchObject({ status: "error", errorCode: "invalid_request" });
    expect(reader).toHaveBeenCalledTimes(1);
    expect(await connector.createReservation({ ...request, customerName: "Test",
      customerContact: "test@example.invalid", customerConfirmed: true,
      idempotencyKey: "test" })).toMatchObject({ status: "unsupported" });
    const confirmed = { ...request, customerName: "Test", customerContact: "test@example.invalid",
      customerConfirmed: true as const, idempotencyKey: "test", reservationId: "none" };
    expect(await connector.getReservation(config.clientId, config.outletId, "none"))
      .toMatchObject({ status: "unsupported" });
    expect(await connector.updateReservation(confirmed)).toMatchObject({ status: "unsupported" });
    expect(await connector.cancelReservation(confirmed)).toMatchObject({ status: "unsupported" });
    expect(reader).toHaveBeenCalledTimes(1);
  });
});
