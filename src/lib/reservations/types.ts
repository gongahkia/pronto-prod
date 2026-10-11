export type ReservationCapabilities = {
  availability: boolean;
  create: boolean;
  read: boolean;
  update: boolean;
  cancel: boolean;
};

export type ReservationRequest = {
  clientId: string;
  outletId: string;
  date: string;
  time: string;
  partySize: number;
};

export type ConfirmedReservationRequest = ReservationRequest & {
  customerName: string;
  customerContact: string;
  customerConfirmed: true;
  idempotencyKey: string;
};

export type ReservationAvailability = "available" | "unavailable" | "unknown";
export type ReservationResult =
  | { status: "confirmed"; providerReservationId: string; date: string; time: string; partySize: number }
  | { status: "conflict" | "ambiguous" | "unsupported"; reason: string };

export interface ReservationConnector {
  readonly provider: string;
  readonly capabilities: ReservationCapabilities;
  getAvailability(request: ReservationRequest): Promise<ReservationAvailability>;
  createReservation(request: ConfirmedReservationRequest): Promise<ReservationResult>;
  getReservation(clientId: string, outletId: string, reservationId: string): Promise<ReservationResult>;
  updateReservation(request: ConfirmedReservationRequest & { reservationId: string }): Promise<ReservationResult>;
  cancelReservation(request: ConfirmedReservationRequest & { reservationId: string }): Promise<ReservationResult>;
}
