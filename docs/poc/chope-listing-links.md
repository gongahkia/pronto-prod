# PRON-39 — experimental Chope listing links

25 October 2026, Asia/Singapore. Repository:
`/home/gongahkia/coding/projects/pronto-app`.

## 1. Executive verdict

**PARTIAL.** The approved experimental listing-link capability is implemented,
grounded in scoped availability observations, and connected to the existing
agent/worker and Tranche 01 simulator backend. The earlier product decision gate
is resolved. No new provider permission or reservation authority is inferred.

Fresh matching observations can produce multiple preselected slot links, including
alternatives to an unavailable requested time. Unknown, stale, erroneous and
unsupported results cannot produce apparent available slot links. The existing
verified general URL and human/group policies remain.

Current implementation has deterministic and isolated-database acceptance. The
saved Tranche 00 native URL trials are reproducible with this builder, but no new
live provider request or fresh remote-browser check was made. Downstream
booking-form behavior remains unverified. **PRON-39 should remain open for genuine
integration acceptance.** Jira was not changed.

## 2. Exact code changes and repository preservation

Entry branch/HEAD: `main`,
`cdc3d6637a5ed87f40db35f314bb637b9a4282e4`. Entry worktree: zero staged,
22 modified tracked files and 17 untracked files from previous work. This task
did not stage, commit, push, reset, clean or rebase. Other Codex processes were
present, but no conflicting edits were observed. Entry hashes were saved privately
to distinguish this task's edits from the existing Tranche 01 work.

| File | This task's change |
|---|---|
| `src/lib/reservations/types.ts` | Optional experimental listing capability, explicit date/party availability requests and typed link result; booking writes still require a specific time |
| `src/lib/reservations/chope.ts` | Validated URL builder, date-only availability intent, fresh-observation validation, bounded observed alternatives, customer explanations, general-link recovery and provenance |
| `src/lib/reservations/chope-browser.ts` | Advertise the experimental capability and accept availability queries without a preferred time; existing network/authorization/rate boundaries remain |
| `src/lib/agent/engine.ts` | Two localized changes: persist reservation evidence in existing agent metadata and carry the assistant's factual reason detail; prior Tranche 01 changes preserved |
| `tests/fixtures/fake-chope.ts` | Accommodate date-only requests without inventing a fixture preferred time |
| `tests/unit/chope-listing-links.test.ts` — new | 57 URL, validation, scope, observation, fallback, alternative and no-write cases |
| `tests/unit/chope-browser-read.test.ts` | One additional date-only reader scenario using simulated Chromium |
| `tests/unit/chope-browser.test.ts` | Assert the new optional capability |
| `tests/unit/chope-connector.test.ts` | Update the unavailable-requested-time expectation and invalid-observation explanation |
| `tests/integration/chope-listing-flow.test.ts` — new | Four connected simulator/worker/outbox/provenance and negative-scope/freshness scenarios |
| `docs/integrations/chope-live-read.md` | Supersede the earlier gate, document compatibility, switch, safety and current boundaries |
| `docs/poc/chope-listing-links.md` — new | This report |

Significant source locations: `chope.ts:28` validates availability requests,
`:65` builds URLs, `:104` parses enquiries, `:169` validates observations and
`:194` integrates availability/replies. Capability is in `types.ts:8`, the browser
connector in `chope-browser.ts:50`, and evidence propagation in `engine.ts:137`.

No dependency, lockfile, environment, migration, frontend, Instagram, Eatigo, Oddle,
operator-removal or deployment change was made. Migration inventory remains 045.
The dated Tranche 00 and Tranche 01 reports remain untouched. Only the shared
Chope guide and the two localized engine lines intentionally intersect prior work.
Final Git/hash inventory: HEAD unchanged, zero staged, 30 modified tracked files
and 20 untracked files, including all earlier work. Of the entry files, only the
nine intentional files above changed; the three new files are the new unit suite,
DB suite and this report. All other entry hashes, including environment, manifest,
lockfile, migrations, Tranche 00/01 reports and customer/business UI, are preserved.

## 3. URL generation and compatibility assumptions

`buildChopeListingLink` accepts a verified mapping containing tenant, provider,
outlet, URL and verification time, plus Singapore-local date, selected `HH:mm` time
and party size. It requires
`listingPreselection: "experimental_chope_listing_v1"` and returns a result marked
experimental with downstream preselection explicitly `unverified`.

It supports only the canonical observed form:

```text
https://www.chope.co/singapore-restaurants/restaurant/<verified-slug>
```

The original restaurant path is preserved. Parameters use `URLSearchParams`:

```text
children=0&adults=2&date=2026-10-26&time=10%3A15+am
```

This example describes encoding, not current inventory. Midnight/noon and minutes
are converted to the observed lower-case 12-hour display format. Party size maps
to adults and children is zero; explicit child-group enquiries use the existing
human path. Validation preserves the existing 1–20 integer range and PS.Cafe's
separate large-group handoff threshold. Party sizes two/four have earlier listing
evidence; arbitrary party-size/provider acceptance is not claimed.

Invalid calendar dates, past selections, malformed times, fractional/out-of-range
parties, mismatched tenants/outlets, invalid verification times and unsupported
destinations do not produce a URL. Credentialed URLs, custom ports, fragments,
query-bearing bases, encoded path tricks and booking/checkout destinations are
rejected for preselection. Other approved general booking formats retain their
general-link path. General URL validation additionally rejects custom ports and
fragments.

The pure builder performs no availability lookup and asserts no inventory. The
customer-response integration invokes it only for actual slots in a matching,
fresh result. It checks provider, outlet, date, party, timezone, timestamp and
status/slot consistency, rejects future timestamps and observations older than
five minutes, and excludes malformed/past times. Availability without a requested
time is represented explicitly; no invented preferred time is passed to Chope.

Responses display at most six unique observed slots. A requested time influences
which genuine alternatives are selected, not which times are invented. The
requested observed time is retained; selected alternatives are shown chronologically.
When there are more observations, displayed and total counts are stated. Public
observation context and link mode persist in existing message metadata.

Compatibility is experimental. There is no automatic detector for future Chope
changes. Every preselected response includes the verified general URL and explains
how to recover if selections disappear. Setting
`PRONTO_CHOPE_LISTING_LINKS_ENABLED=0` in the worker launch environment disables
new preselected links, retaining observations and the general-link path. It does
not revoke already delivered URLs and is independent of read authorization.

## 4. Actual listing-preselection evidence

The existing real evidence was inspected, not merely assumed from the prior
report. Files under `/tmp/pronto-tranche00/provider-evidence` show four HTTP 200
trials on 25 October 2026, each starting with zero cookies:

| Trials | Date | Visible time | Adults | Children |
|---|---|---|---|---|
| `fresh-url-results.json`, attempts 1–2 | 26 October 2026 | 10:00am | 2 | 0 |
| `nondefault-url-results.json`, attempt 1 | 26 October 2026 | 10:15am | 2 | 0 |
| `nondefault-url-results.json`, attempt 2 | 26 October 2026 | 10:15am | 4 | 0 |

The visible restaurant ID was `pscaferafflescity1808psc`. The saved listing script
contains `formatDateQuery`, `formatTimeQuery` and `formatPeopleQuery`, confirming
that these query keys came from Chope's own listing code. The saved screenshots
and JSON show visible control retention. They do not prove final booking input
propagation: the hidden `date` and `time` fields were empty in those snapshots.

This task generated URLs from those four recorded selections and compared them
byte-for-byte with the captured URLs: **four matches, zero new provider requests**.
Reproduction output is `/tmp/pronto-pron39/response-evidence.json`; its local
script and log are alongside it. This is offline evidence reproduction, not a new
remote browser test or proof that the provider still behaves identically.

The earlier genuine availability read at 12:02:48 SGT is expired. No historical
slot or synthetic fixture slot has been installed as live production availability.

## 5. Downstream booking-form status

**UNVERIFIED.** No `/booking/check`, checkout, payment or reservation submission
was attempted. No inventory hold or reservation was created. The code promises
only an experimental listing preselection request; it does not promise that every
field survives the subsequent form step.

There is no provider-supported external contract, URL-lifetime guarantee or
comprehensive cookie/session guarantee established here. The static generated
URL has no token or expiry field, but actual inventory and provider behavior can
change. Final checks and confirmation belong to Chope.

## 6. Customer examples and fallback behavior

The examples below are **synthetic test observations, not current availability**.
The test provider returned 18:30 and 19:30 for a party of two on 26 October, with
an observation time of 25 October at 12:00 SGT.

Customer: “What timings are available tomorrow for two people?”

The response identifies the date/party/timezone, states when the timings were
observed, and provides:

```text
18:30 — ...?children=0&adults=2&date=2026-10-26&time=6%3A30+pm
19:30 — ...?children=0&adults=2&date=2026-10-26&time=7%3A30+pm
```

It explains that the links are experimental, downstream preselection is not
guaranteed, availability can change and Chope handles final confirmation. It
explicitly says this is not a booking. Full generated examples are in
`/tmp/pronto-pron39/response-evidence.json`.

Customer: “Hi, can I reserve a table for two tomorrow around 7pm?”

With the same fixture observation, the response says **19:00 was not returned as
available** and provides only 18:30/19:30 alternatives. It produces no apparent
19:00 slot link.

| Condition | Behavior |
|---|---|
| Fresh available slots | Timestamped observed choices, experimental links if supported, general URL recovery and no-booking explanation |
| Fresh unavailable result | No available timings claimed; dated observation context and general URL |
| Unknown/unsupported provider or thrown error | Clearly cannot verify current availability; existing general URL |
| Stale observation | Says the observation is too old; no old slots or slot links |
| Capability disabled/unsupported URL format | Genuine observed times may still be shown; clear instruction to select details using the general URL |
| Missing verified mapping, malformed/missing parameters or explicit child breakdown | Existing human path |
| Large group requiring review | Existing tenant policy handoff before provider access |
| Cross-tenant connector | No reader access; no claimed availability or slot links |

General URLs are emitted without attached sentence punctuation so the existing
customer link renderer preserves the actual destination. No frontend rewrite was
needed.

## 7. Testing and local runtime

All new provider observations are injected deterministic fixtures. The Chromium
reader tests use a simulated transport. Ordinary tests reject unmocked external
network access; database tests use the separately marked, previously owned local
test cluster on 55434 after repository identity verification. The persistent
demo database on 55433 is not used for fixture removal/reset.

| Actual command/check | Result |
|---|---|
| `pnpm test` | 387 passed, 93 skipped, zero failed; 92 files |
| `pnpm exec vitest run tests/unit/chope-listing-links.test.ts tests/unit/chope-connector.test.ts tests/unit/chope-browser.test.ts tests/unit/chope-browser-read.test.ts` | 102 passed, zero failed/skipped |
| `/tmp/pronto-tranche00/test-run env PRONTO_RUN_DB_TESTS=1 pnpm exec vitest run tests/integration/chope-listing-flow.test.ts tests/integration/ps-cafe-demo.test.ts tests/integration/customer-simulator.test.ts` | 27 passed, including four new connected-link scenarios |
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| Guarded isolated `pnpm build` | PASS |
| `/tmp/pronto-tranche00/test-run pnpm test:db` | 472 passed, eight skipped, zero failed |
| `/tmp/pronto-tranche00/test-run pnpm test:local-mail` | Eight passed, zero failed/skipped |
| Guarded isolated Playwright | 17 passed, zero failed/skipped |
| Offline comparison with saved real listing trials | Four exact URL matches; no provider request |
| Actual persistent-stack Chromium smoke | Completed availability enquiry, correct general URL, matching owner view, zero page errors; reads remained off |
| `git diff --check` | PASS |

Logs are under `/tmp/pronto-pron39/logs`. The isolated app copy is
`/var/tmp/pronto-pron39-app`, with only its test config/allowlists adapted to 3001.
Dependencies were reused without changing the manifest or lockfile. The build
does not touch the running application's `.next` tree. The test wrapper supplies
matching verified URLs, mock AI and sanitized test-only auth/encryption settings.

Build invocation:

```sh
PRONTO_TRANCHE_WORKDIR=/var/tmp/pronto-pron39-app \
/tmp/pronto-tranche00/test-run env \
  NODE_OPTIONS=--import=./tests/setup/network-guard.mjs \
  PRONTO_TEST_ALLOW_BUILD_IPC=1 pnpm build
```

Playwright invocation:

```sh
PRONTO_TRANCHE_WORKDIR=/var/tmp/pronto-pron39-app \
/tmp/pronto-tranche00/test-run env \
  APP_BASE_URL=http://localhost:3001 PLAYWRIGHT_BASE_URL=http://localhost:3001 \
  PRONTO_TEST_LOCAL_MAIL=1 PRONTO_LOCAL_EMAIL_ENABLED=1 \
  PRONTO_LOCAL_STAFF_COMMANDS=1 PRONTO_LOCAL_STAFF_E2E=1 \
  PRONTO_CUSTOMER_DEMO_ENABLED=1 PRONTO_DEMO_ONLY_DELIVERY=1 \
  PRONTO_TEST_ALLOW_BUILD_IPC=0 \
  NODE_OPTIONS=--import=./tests/setup/network-guard.mjs \
  pnpm exec playwright test --workers=1
```

Relative to the entry Tranche 01 baseline, 58 new unit/reader cases and four new DB
cases explain the changed totals. The eight local-mail cases remain separately
opted in; no coverage or genuine LLM acceptance is inferred from these results.
The temporary 3001 web server/worker stopped after Playwright. The owned 55434 test
cluster was stopped after another identity verification; its files are retained.
To rerun these tests here, restart it with
`pg_ctl -D /tmp/pronto-tranche00/pgdata -l /tmp/pronto-pron39/logs/test-postgres.log -w start`
and run `/tmp/pronto-tranche00/test-run pnpm test:db:verify` before using the wrapper.
An initial existing-test edit selected the wrong expectation; it was corrected
before the passing runs without changing stale-result behavior.

## 8. Remaining provider/authorization limitations

- Product approval covers experimental listing links, not additional provider
  reads. Existing dual read opt-ins, tenant/outlet activation, 20-second deadline,
  one-minute per-process interval and no-booking request boundary remain intact.
- The exact written agreement limits and broader activation terms are not
  independently established by this task. No new live read or remote browser
  trial was performed, and no opt-in was enabled in the persistent demo.
- The existing limiter is process-local; do not run multiple live-reading workers
  without establishing the applicable shared rate/permission boundary.
- Current listing compatibility, unavailable selected-value replacement, downstream
  form propagation, expiry and inventory continuity remain external acceptance
  limits. Compatibility failure needs the documented switch/general-link recovery;
  there is no automatic remote compatibility monitor.
- Real AI credentials remain absent from the local demo. Reservation tool/policy
  replies are not evidence of genuine model generation. This task did not change
  LLM configuration or replace ordinary RAG answers.

The smallest remaining acceptance step is one separately permitted fresh
availability observation through the running agent, followed by a bounded,
cookie-free check of the generated listing links. Any downstream investigation
must first establish that the step cannot hold or mutate inventory. Do not work
around restrictions. Keep PRON-39 open meanwhile; no Jira update was made.

## 9. Interaction with Tranche 01

Tranche 01 is already implemented locally. The new integration tests use its
authenticated customer-session service, actual inbox, worker, message persistence,
outbox delivery and business-inbox query. They verify that slot provenance survives
and links are visible only after local delivery. They also prove stale/cross-tenant
fallback through the same path.

The customer and business frontends, authentication/capability boundaries, human
takeover/release, real/mock isolation, RAG and schema are preserved. The existing
deterministic restaurant-assistance branch is extended; other enquiries still use
their existing LLM/RAG and handoff paths.

The persistent local simulator remains at <http://localhost:3000/demo/customer>,
business inbox at <http://localhost:3000/client/inbox>, and Mailpit at
<http://localhost:8025>, in tmux `pronto-local`. Its provider reads remain disabled,
so normal interactive availability enquiries honestly use the general URL. Test
fixture slots have not been loaded into its live availability path.

After a graceful reload of only the existing worker, a new actual simulator
enquiry (“What timings are available tomorrow for two people?”) completed its
durable job and delivered a general-link response. The browser verified the exact
fallback `href`, zero preselected links, two persisted customer/business messages
and the corresponding authorized owner view, with zero page errors. The example
remains at `/client/conversations/326172f9-1ecc-4792-9bac-a479c0551653`.
Evidence is `/tmp/pronto-pron39/runtime-smoke.json` and `customer-fallback.png`.
This confirms the running unknown-provider path, not genuine live availability or
model inference. PostgreSQL, Mailpit and the web process were preserved.

Use `/tmp/pronto-tranche01/start-services` to start only missing/stopped services,
`/tmp/pronto-tranche01/restart-app` to reload web/worker, and
`/tmp/pronto-local/stop-services` to stop this local stack without dropping data.
Worker logs remain `/tmp/pronto-tranche01/logs/worker.log`; this task's checks/logs
are under `/tmp/pronto-pron39`. Temporary test services are stopped after checking;
the interactive application stays running.

## 10. ChatGPT handover

Gabriel approved using Chope's observed native listing query parameters for the
POC on 25 October 2026. The old Tranche 00 product decision gate is resolved for
listing links only. It does not imply official API support, downstream booking
preselection, provider-read permission or reservation authority.

Pronto now has an experimental, capability-aware Chope listing URL builder using
date, time, adults and children. Tenant/provider/outlet identity, canonical
destination, future Singapore-local dates/times and party size are validated.
Date/party availability enquiries can omit a preferred time. The existing booking
assistant displays up to six genuine fresh observed slots with individual links,
including alternatives when a requested time is absent. It never derives available
inventory from the requested time. Unknown/error/stale results use the existing
verified general URL or human handoff. A disable switch and general-link recovery
are documented. Observation and experimental-link provenance are persisted.

The existing Tranche 01 customer simulator and business inbox reuse this path
without a frontend rewrite. Connected DB/worker/outbox fixture tests pass. Existing
human ownership, tenant authorization, approval architecture and real/mock AI
behavior are preserved. There is no new reservation subsystem, migration or
provider write implementation.

Actual external evidence remains the four earlier fresh-cookie-free listing
trials, which retained tested date/time/party values. The new builder reproduces
all four captured URLs exactly offline. No new live provider request or fresh
remote browser trial was made. Downstream form preselection remains unverified;
hidden date/time fields were empty in the old listing snapshots. No reservation
was submitted or held. Synthetic examples are not current availability.

Local reads remain disabled until separately permitted/configured. Keep PRON-39
open for genuine integration acceptance. The immediate technical follow-up is a
bounded authorized fresh agent observation and generated-link check, not another
frontend rewrite or booking-write feature. No Jira/Confluence update, deployment,
operator removal or unrelated connector change occurred. Final tests and runtime
details are in sections 7 and 9 of this report. Current results: ordinary 387
passed/93 skipped; DB-inclusive 472 passed/eight skipped; local mail eight passed;
Playwright 17 passed; focused Chope 102 passed; typecheck, lint and guarded build
passed. These are local fixture and regression results, not fresh live acceptance.
