import { assertTurnActive } from "@/lib/agent/turn-budget";
import { query, transaction } from "@/lib/db";
import { configuredChopeBrowserConnector } from "@/lib/reservations/chope-browser";
import { invalidObservation, validateAvailabilityRequest } from "@/lib/reservations/chope";
import type { AvailabilityResult, ReservationAvailabilityRequest, ReservationConnector } from "@/lib/reservations/types";

type CacheRow = { result: AvailabilityResult | null; checked_at: string | null; lease_until: string | null };
export type CachedAvailability = { result: AvailabilityResult; cacheHit: boolean; observationId?: string };
const keys = (r: ReservationAvailabilityRequest) => [r.clientId, r.outletId, r.date, r.partySize];
const predicate = "client_id = $1 and outlet_id = $2 and reservation_date = $3 and party_size = $4";

function unknown(request: ReservationAvailabilityRequest, errorCode: AvailabilityResult["errorCode"]): AvailabilityResult {
  return { outletId: request.outletId, date: request.date, partySize: request.partySize, provider: "chope",
    timezone: "Asia/Singapore", availableSlots: [], observedAt: null, status: "unknown", errorCode };
}

// Validate database contents as well as fresh network results before grounding a reply.
export function usableObservation(result: AvailabilityResult | null, request: ReservationAvailabilityRequest,
  now = new Date()): boolean {
  return !!result && ["available", "unavailable"].includes(result.status) &&
    !invalidObservation(result, request, "chope", now);
}

export async function getCachedChopeAvailability(request: ReservationAvailabilityRequest,
  connector: ReservationConnector, options: { scheduled?: boolean } = {}): Promise<CachedAvailability> {
  assertTurnActive();
  if (connector.provider !== "chope" || !connector.capabilities.availability)
    return { result: unknown(request, "missing_authorization"), cacheHit: false };
  if (!validateAvailabilityRequest(request)) return { result: unknown(request, "invalid_request"), cacheHit: false };
  // No preferred time in the cache identity: one provider read returns the day's slots.
  const dateRequest = { clientId: request.clientId, outletId: request.outletId, date: request.date, partySize: request.partySize };
  const claim = await transaction(async db => {
    await db.query(`insert into reservation_availability_cache (client_id, outlet_id, reservation_date, party_size)
      values ($1,$2,$3,$4) on conflict do nothing`, keys(request));
    const row = (await db.query<CacheRow>(`select result, checked_at, lease_until from reservation_availability_cache
      where ${predicate} for update`, keys(request))).rows[0];
    if (!options.scheduled) await db.query(`update reservation_availability_cache set last_requested_at = now()
      where ${predicate}`, keys(request));
    if (usableObservation(row.result, dateRequest)) return { kind: "cached" as const, result: row.result! };
    if (row.lease_until && new Date(row.lease_until).getTime() > Date.now()) return { kind: "waiting" as const };
    // Cross-process cooldown; the lock is held only while claiming, never during Chromium I/O.
    await db.query("select pg_advisory_xact_lock(hashtextextended('pronto:chope:availability',0))");
    const allowed = await db.query(`insert into reservation_provider_limits (provider, next_read_at)
      values ('chope',now() + interval '1 minute') on conflict (provider) do update
      set next_read_at = excluded.next_read_at where reservation_provider_limits.next_read_at <= now() returning provider`);
    if (!allowed.rowCount) return { kind: "limited" as const };
    await db.query(`update reservation_availability_cache set lease_until = now() + interval '30 seconds'
      where ${predicate}`, keys(request));
    return { kind: "read" as const };
  });
  if (claim.kind === "cached") return { result: claim.result, cacheHit: true };
  if (claim.kind === "limited") return { result: unknown(request, "rate_limited"), cacheHit: false };
  if (claim.kind === "waiting") {
    // Coalesce simultaneous enquiries for the same date and party size.
    for (let attempt = 0; attempt < 42; attempt++) {
      assertTurnActive();
      await new Promise(resolve => setTimeout(resolve, 500));
      const row = (await query<CacheRow>(`select result, checked_at, lease_until from reservation_availability_cache
        where ${predicate}`, keys(request))).rows[0];
      if (!row?.lease_until || new Date(row.lease_until).getTime() <= Date.now()) {
        return { result: usableObservation(row?.result ?? null, dateRequest) ? row.result! : unknown(request, "provider_timeout"), cacheHit: true };
      }
    }
    return { result: unknown(request, "provider_timeout"), cacheHit: false };
  }
  let result: AvailabilityResult;
  try {
    const observed = await connector.getAvailability(dateRequest);
    result = usableObservation(observed, dateRequest) ? observed
      : unknown(request, observed?.errorCode ?? "unexpected_response");
  } catch { result = unknown(request, "network_error"); }
  assertTurnActive();
  const observationId = await transaction(async db => {
    assertTurnActive();
    const observation = await db.query<{ id: string }>(`insert into reservation_availability_observations
      (client_id, outlet_id, reservation_date, party_size, result) values ($1,$2,$3,$4,$5) returning id`, [...keys(request), result]);
    await db.query(`update reservation_availability_cache set result = $5, checked_at = now(), lease_until = null,
      next_refresh_at = now() + interval '1 hour' where ${predicate}`, [...keys(request), result]);
    return observation.rows[0].id;
  });
  return { result, cacheHit: false, observationId };
}

// Refresh only date/party combinations customers actually requested in the last day.
// On-demand enquiries still enforce the five-minute observation limit above.
export async function refreshDueChopeAvailability(): Promise<void> {
  if (process.env.PRONTO_CHOPE_LIVE_READS !== "1" || process.env.CHOPE_LIVE_READ_APPROVED !== "1") return;
  const due = await query<{ client_id: string; outlet_id: string; date: string; party_size: number; business_profile: Record<string, unknown> }>(
    `select cache.client_id, cache.outlet_id, cache.reservation_date::text as date, cache.party_size, c.business_profile
     from reservation_availability_cache cache join clients c on c.id = cache.client_id
     where cache.next_refresh_at <= now() and cache.last_requested_at > now() - interval '24 hours'
       and cache.reservation_date >= (now() at time zone 'Asia/Singapore')::date
       and (cache.lease_until is null or cache.lease_until <= now())
     order by cache.next_refresh_at limit 10`);
  for (const row of due.rows) {
    const connector = configuredChopeBrowserConnector(row.client_id, row.business_profile);
    const mapping = row.business_profile.chopeBooking as { outletId?: string } | undefined;
    if (!connector || mapping?.outletId !== row.outlet_id) continue;
    await getCachedChopeAvailability({ clientId: row.client_id, outletId: row.outlet_id,
      date: row.date, partySize: row.party_size }, connector, { scheduled: true });
    break; // Shared one-read-per-minute budget also applies to scheduled work.
  }
}
