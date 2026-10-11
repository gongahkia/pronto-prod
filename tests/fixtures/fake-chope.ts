import type {
  ConfirmedReservationRequest, ReservationConnector, ReservationRequest,
  ReservationResult, ReservationAvailability, AvailabilityResult,
} from "@/lib/reservations/types";
import { validateReservationRequest } from "@/lib/reservations/chope";

export class FakeChopeConnector implements ReservationConnector {
  readonly provider = "chope-fake";
  readonly capabilities = { availability: true, create: true, read: true, update: false, cancel: false };
  readonly reservations = new Map<string, ReservationResult>();
  availability: ReservationAvailability = "available";
  failure: "network_error" | "provider_timeout" | "rate_limited" | "unexpected_response" | null = null;
  observationAgeMs = 0;
  now = () => new Date();
  availableSlots: string[] | null = null;
  failAfterAcceptance = false;
  allowedClientId: string;
  allowedOutletId: string;

  constructor(clientId: string, outletId: string) {
    this.allowedClientId = clientId;
    this.allowedOutletId = outletId;
  }

  async getAvailability(request: ReservationRequest): Promise<AvailabilityResult> {
    this.assertScope(request);
    const valid = validateReservationRequest(request, this.now());
    const status = !valid || this.failure ? "error" : this.availability;
    return { outletId: request.outletId, date: request.date, partySize: request.partySize,
      availableSlots: status === "available" ? (this.availableSlots ?? [request.time]) : [],
      timezone: "Asia/Singapore", provider: this.provider,
      observedAt: new Date(this.now().getTime() - this.observationAgeMs).toISOString(),
      status, ...(!valid ? { errorCode: "invalid_request" as const } :
        this.failure ? { errorCode: this.failure } : {}) };
  }

  async createReservation(request: ConfirmedReservationRequest): Promise<ReservationResult> {
    this.assertScope(request);
    if (!validateReservationRequest(request, this.now())) {
      return { status: "unsupported", reason: "Invalid reservation request." };
    }
    if (request.customerConfirmed !== true || !request.customerName || !request.customerContact ||
        !request.idempotencyKey) return { status: "unsupported", reason: "Confirmation and customer details required." };
    const existing = this.reservations.get(request.idempotencyKey);
    if (existing) return existing;
    if (this.availability !== "available") return { status: "conflict", reason: "No availability." };
    const result: ReservationResult = { status: "confirmed", providerReservationId: `fake-${request.idempotencyKey}`,
      date: request.date, time: request.time, partySize: request.partySize };
    this.reservations.set(request.idempotencyKey, result);
    if (this.failAfterAcceptance) return { status: "ambiguous", reason: "Provider timed out after acceptance." };
    return result;
  }

  async getReservation(clientId: string, outletId: string, reservationId: string): Promise<ReservationResult> {
    this.assertScope({ clientId, outletId });
    return [...this.reservations.values()].find((row) => row.status === "confirmed" &&
      row.providerReservationId === reservationId) ?? { status: "conflict", reason: "Reservation not found." };
  }

  async updateReservation(request: ConfirmedReservationRequest & { reservationId: string }): Promise<ReservationResult> {
    void request;
    return { status: "unsupported", reason: "Update capability is unavailable." };
  }

  async cancelReservation(request: ConfirmedReservationRequest & { reservationId: string }): Promise<ReservationResult> {
    void request;
    return { status: "unsupported", reason: "Cancel capability is unavailable." };
  }

  private assertScope(request: { clientId: string; outletId: string }): void {
    if (request.clientId !== this.allowedClientId || request.outletId !== this.allowedOutletId) {
      throw new Error("Reservation connector tenant or outlet mismatch.");
    }
  }
}
