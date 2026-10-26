# Chope availability in real-model conversations

## Current PS.Cafe prototype (26 October 2026)

The local PS.Cafe prototype now connects real-model booking enquiries to the existing read-only Chope browser connector. Both local web and worker launch environments enable `PRONTO_CHOPE_LIVE_READS=1` and `CHOPE_LIVE_READ_APPROVED=1`; the PS.Cafe tenant's matching `business_profile.chopeAvailability` mapping is enabled. This follows the user's request to check public availability and return a useful Chope booking link.

The selected real model extracts the date, preferred time, total party size and outlet from the current message and recent conversation. Relative weekdays use an explicit Singapore calendar. Extracted dates are validated against explicit dates and weekdays; one model repair is allowed, and a repeated mismatch becomes an unanswered date rather than a lookup for the wrong day. Missing details remain missing. The tool does not ask the model to invent availability.

A complete supported date/party request invokes the scoped cache/reader. Its result is supplied as a cited source to a second genuine model call, which writes the customer-facing reply. Ordinary booking referrals can be answered without a staff handoff. Existing human-owned conversations remain paused; enabling this tool does not automatically release staff ownership. Existing booking changes/cancellations, unsupported outlets or child breakdowns and configured large-group requests retain the staff path.

The generated listing URL carries `children=0`, `adults=<party size>`, `date=YYYY-MM-DD`, and `time=h:mm am/pm`, encoded with `URLSearchParams`. This is an experimentally observed listing format, not an official Chope API contract. Customers check the selections and complete/confirm on Chope. Pronto never submits a reservation or holds a table. A slot must be an actual fresh observation; a timeout, stale result or failed read can still produce the correctly prefilled link with an honest explanation that availability could not be verified.

## Schedule and storage

Run `pnpm migrate` to apply migration `048_reservation_availability.sql`, and keep `pnpm worker` (or the guarded customer-demo worker) running.

- `reservation_availability_cache`: latest result, checked time, last customer request, hourly refresh due time and short refresh lease. Identity is tenant + outlet + date + party size; the preferred time is not part of the key because one read obtains the day's selectable times.
- `reservation_availability_observations`: append-only read attempts, including successful slots and unknown/error results, with scope and timestamps. Original website HTML, diner details and booking records are not stored.
- `reservation_provider_limits`: a shared PostgreSQL one-read-per-minute budget across web and worker processes. The browser also retains its per-process cooldown.
- `messages.metadata.reservation`: the request, observed time/status/slots, generated links, cache provenance and extraction response ID for each successful model reply.
- `agent_traces.steps`: the model's request extraction, Chope check and knowledge source snapshot. The conversation's Decision flow shows the check and cited source; it records explanations, not private chain-of-thought.

The worker checks for due work in its normal 15-second loop. It refreshes recently requested future date/party combinations hourly while those combinations have been requested within the last 24 hours. It does not crawl every date or party size. At most one due combination is attempted per loop, subject to the shared minute budget.

An interactive enquiry accepts an availability observation only when it is at most **five minutes old**, with matching tenant/outlet/date/party/provider and valid future Singapore times. An older hourly observation triggers a fresh read before an availability claim. Simultaneous requests for the same combination share a short database lease and wait for the in-flight result. Failures and shared cooldowns never turn stale slots into current availability.

## Runtime setup

Set both flags on every process that runs inference or scheduled work:

```dotenv
PRONTO_CHOPE_LIVE_READS=1
CHOPE_LIVE_READ_APPROVED=1
```

The tenant profile must contain an approved `chopeBooking` link and matching `chopeAvailability` object with `enabled: true`, `mode: "browser"`, `scope: "demo_availability"`, `outletId`, `listingUrl` and `authorizedAt`. The existing seed keeps live reading disabled by default. Enabling this specific local tenant does not change other tenants or environments.

Install a Chromium binary with `pnpm exec playwright install chromium`, or set `PRONTO_CHOPE_CHROMIUM_PATH` to an installed executable. For container workers use the existing `worker-chope` Docker target, which includes Chromium and its system libraries. A deployment needs the same migration, tenant mapping, flags, browser binary and continuously running worker for hourly refreshes. Starting only the Next.js frontend does not run the schedule.

Set `PRONTO_CHOPE_LISTING_LINKS_ENABLED=0` to disable new preselected URLs while retaining the general approved outlet URL. Disable either live-read flag to stop network reads; new replies then acknowledge that availability cannot be verified and direct customers to the approved link.

## Reader boundary

The browser opens only the configured public restaurant listing, verifies its outlet ID, selects the date and party size, and reads the displayed time options. It permits one matching `get_times` availability POST for the exact outlet/date/party and blocks booking/check, checkout, payment and all other POST requests. It never clicks Book Now, follows booking hosts or bypasses CAPTCHA. Reads have a 20-second deadline. Create/read/update/cancel booking capabilities remain unsupported.

Only the approved canonical listing form `https://www.chope.co/singapore-restaurants/restaurant/<slug>` supports preselection. Mismatched tenants/outlets, invalid dates, credentials, ports, fragments and noncanonical destinations are rejected. Successful observations and generated URLs still do not establish a reservation or guarantee final availability.

## Standalone diagnostic

This explicit diagnostic performs one authorized read and prints JSON. It intentionally does not write to the application cache/history or use the shared database limiter. Use the application conversation path to verify persistence and shared scheduling.

```sh
CHOPE_LIVE_READ_APPROVED=1 PRONTO_CHOPE_LIVE_READS=1 \
  pnpm chope:live-read demo-tenant pscaferafflescity1808psc \
  https://www.chope.co/singapore-restaurants/restaurant/ps-cafe-raffles-city \
  2026-10-31 19:00 4
```

Use a future date. Automated tests mock the browser/provider transport and do not contact Chope or an inference provider. Dated observations in prior [POC reports](../poc/chope-listing-links.md) remain historical evidence and must never be presented as current inventory.
