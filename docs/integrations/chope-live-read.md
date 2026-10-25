# Chope demo availability reader

## 25 October 2026 POC verification

After the agreement owner reaffirmed the previously supplied demo authorization,
one controlled PS.Cafe Raffles City enquiry reached this reader through a durable
inbound job and `processInboundJob`. At **12:02:48 Singapore time**, the request
for **26 October 2026, party of two**, observed eight selectable times:
10:00, 10:15, 10:30, 10:45, 11:00, 11:15, 11:30 and 12:30. **19:00 was not
among them.** These are expired observations, not current availability. Exactly
one matching `get_times` POST was observed; no reservation was submitted. The
agent's existing outlet-link reply was queued. This booking branch is
deterministic and does not establish real LLM inference or automatic tenant
activation: the controlled job used an explicitly scoped injected connector.

The listing's own JavaScript writes `date`, `time`, `adults` and `children`
query parameters. Four fresh, cookie-free listing sessions preserved the tested
date/time/party selections, including non-default 10:15am and party size four.
Those probes blocked additional availability POSTs and all booking submissions;
party-of-four availability was **not** checked. This establishes current listing
preselection behavior, not a stable published provider contract, downstream
booking-page behavior, URL lifetime, or any hold on inventory.

**POC decision gate:** exact-link product implementation remains paused pending
Gabriel's review of these compatibility limits. No exact-link builder or new
general-link fallback was added. The existing outlet-link behavior is preserved.
See [the Tranche 00 report](../poc/tranche00-verification.md) for evidence,
test results and the next implementation boundary. Do not use the dated probe
URLs as evidence that a reservation is available.

The parser now accepts “tomorrow around 7pm” and explicit 24-hour times, while
missing or ambiguous parameters still use the existing human path. Deterministic
tests also cover the read deadline, scope, rate limit, contradictory observations
and rejection of booking hosts/routes and repeated or mismatched read fields.

This is an **opt-in, read-only demonstration connector** using Chope's public
restaurant listing in Chromium. On 11 October 2026, the user summarized a
written Chope agreement as permitting demo scraping and a booking bot. The
hardcopy was not available to inspect, so exact limits, covered outlets and
technical terms are not independently verified. Keep this disabled for normal
operation until the agreement owner checks those terms. No Chope API contract
or credentials have been supplied. The connector never submits a reservation.

## Request boundary

The browser opens a configured `https://www.chope.co/singapore-restaurants/restaurant/...`
listing, checks its outlet ID, selects party size and date, and reads the
site's displayed time options. It permits one POST to the listing's
`/singapore-restaurants/categories/get_times` read endpoint for the exact
outlet/date/party and blocks every other POST, booking check, checkout and
payment request. It does not click **Book Now**, bypass CAPTCHA or invent
slots. Reads have a 20-second deadline and a 60-second per-process minimum
interval; rate limiting across multiple worker processes is not implemented.
Only run one demo worker until a contractual rate cap and shared limiter are
established. Results are provisional, carry an observation timestamp, and the
agent discards them after five minutes. Failures revert to the verified outlet
booking link or human escalation.

## Explicit live smoke read

Install dependencies with `pnpm install` and a Playwright Chromium binary
with `pnpm exec playwright install chromium`. The browser may alternatively
be selected using `PRONTO_CHOPE_CHROMIUM_PATH`. This command makes one real
availability lookup and does **not** touch Pronto's database or book a table:

```sh
TMPDIR=/var/tmp CHOPE_LIVE_READ_APPROVED=1 PRONTO_CHOPE_LIVE_READS=1 \
  pnpm chope:live-read demo-tenant pscaferafflescity1808psc \
  https://www.chope.co/singapore-restaurants/restaurant/ps-cafe-raffles-city \
  2026-10-12 19:00 2
```

The ordinary Docker `worker` image has no Chromium. For an authorized
container demo, build the optional `worker-chope` target with
`docker build --target worker-chope -t pronto-worker-chope .` and use it
**instead of** the ordinary worker. It installs Chromium and its system
libraries at build time. Run only one such worker until the written rate cap
and a shared limiter are established; the current interval is per process.

Use a future date and current outlet mapping. Without **both** opt-in flags,
the command fails before network access. The default `pnpm test`, DB tests,
CI and local fake-provider demos do not enable these flags or contact Chope.
The result reports provider, date, party size, Singapore timezone, observed
time, status and available times. A failed read exits nonzero and never
reports fabricated availability.

On **11 October 2026 at 23:33 Singapore time**, a real read for PS.Cafe
Raffles City (`pscaferafflescity1808psc`), **12 October 2026, party of two**,
returned 25 selectable times, including 19:00. The browser's displayed
options and adapter output agreed at that observation. A separate read for
**11 October 2026 at 23:37**, after the day's service, returned no future
slots and status `unavailable`. These observations expire; rerun the opt-in
command for current availability. Neither read created a booking.

## Tenant activation

The tenant `business_profile` must contain a matching approved `chopeBooking`
link and `chopeAvailability` object with `enabled: true`, `mode: "browser"`,
`scope: "demo_availability"`, `outletId`, `listingUrl` and `authorizedAt`.
The worker additionally needs both `PRONTO_CHOPE_LIVE_READS=1` and
`CHOPE_LIVE_READ_APPROVED=1`. The PS.Cafe demo
seed sets `enabled: false`; use only a disposable, marked test database when
changing it for a local demonstration. The browser adapter advertises
availability only. Create/read/update/cancel capabilities remain false.

Before broader activation, verify the hardcopy agreement's exact operations,
covered outlets, authentication requirements, request ceiling, retention
rules and test-booking procedure. Do not put the agreement or credentials in
Git. A real booking needs separate approval for a controlled test and a
provider-confirmed reservation reference; this tranche has no write adapter.
