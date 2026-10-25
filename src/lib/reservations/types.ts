export type ReservationCapabilities = {
  availability: boolean;
  create: boolean;
  read: boolean;
  update: boolean;
  cancel: boolean;
  // Internal compatibility label, not an official provider guarantee.
  listingPreselection?: "experimental_chope_listing_v1";
};

export type ReservationRequest = {
  clientId: string;
  outletId: string;
  date: string;
  time: string;
  partySize: number;
};

// A date/party availability enquiry need not invent a preferred booking time.
export type ReservationAvailabilityRequest = Omit<ReservationRequest, "time"> & { time?: string };

export type ReservationBookingLinkResult =
  | { status: "preselected"; provider: "chope"; outletId: string; url: string;
      compatibility: "experimental_chope_listing_v1"; downstreamPreselection: "unverified" }
  | { status: "unsupported" | "invalid"; reasonCode: string };

export type ConfirmedReservationRequest = ReservationRequest & {
  customerName: string;
  customerContact: string;
  customerConfirmed: true;
  idempotencyKey: string;
};

export type ReservationAvailability = "available" | "unavailable" | "unknown";
export type AvailabilityResult = {
  outletId: string;
  date: string;
  partySize: number;
  availableSlots: string[];
  timezone: "Asia/Singapore";
  provider: string;
  observedAt: string | null;
  status: ReservationAvailability | "error";
  errorCode?: "missing_authorization" | "invalid_request" | "network_error" |
    "provider_timeout" | "rate_limited" | "stale" | "unexpected_response";
};
export type ReservationResult =
  | { status: "confirmed"; providerReservationId: string; date: string; time: string; partySize: number }
  | { status: "conflict" | "ambiguous" | "unsupported"; reason: string };

export interface ReservationConnector {
  readonly provider: string;
  readonly capabilities: ReservationCapabilities;
  getAvailability(request: ReservationAvailabilityRequest): Promise<AvailabilityResult>;
  createReservation(request: ConfirmedReservationRequest): Promise<ReservationResult>;
  getReservation(clientId: string, outletId: string, reservationId: string): Promise<ReservationResult>;
  updateReservation(request: ConfirmedReservationRequest & { reservationId: string }): Promise<ReservationResult>;
  cancelReservation(request: ConfirmedReservationRequest & { reservationId: string }): Promise<ReservationResult>;
}
