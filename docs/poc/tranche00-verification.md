# Pronto POC Tranche 00 — verification and Chope findings

Date: 25 October 2026, Asia/Singapore. Repository: `/home/gongahkia/coding/projects/pronto-app`.

## 1. Executive result

**PARTIAL.** The existing local application works, scoped Chope improvements are implemented and tested, and one authorized synthetic agent enquiry invoked the real read-only Chope reader. Exact booking-link product implementation remains at the requested decision gate. Real LLM inference is unavailable because no OpenAI, Azure OpenAI or Anthropic development key is configured.

Implemented changes fix the required “tomorrow around 7pm” sentence, add explicit 24-hour time and additional party-size parsing, reject inconsistent availability observations, and strengthen the browser request boundary. They extend the existing reservation code; no parallel subsystem, migration, operator removal, provider write or deployment was introduced.

The important new finding is that Chope's own listing supports native date/time/party query preselection in the cases tested. This is stronger evidence than the historical generic-link description, but is not a verified stable external contract or a completed downstream booking-flow test. No exact-link builder, unsupported workaround, or new general-link fallback was implemented. The pre-existing outlet-link behavior remains.

Read-only sources included the three current Confluence POC pages and PRON-39/61/62/86/87/88/89/90. Their current scope agrees with the supplied prompt. No Jira or Confluence record was changed. The Atlassian search-company-knowledge skill was used only to retrieve context.

## 2. Actual repository state

Entry branch: `main`. Entry and final HEAD: `34bb86e31739e32a45f04a802c0c2576516ac399`. Entry worktree: clean, with zero staged, modified or untracked files. The ignored `AGENTS.md` symlink resolves to the Next.js instructions; relevant installed Next local-development, CLI and build-directory guidance was read before implementation.

Final changes are six modified tracked files and two new files, listed in section 6; nothing is staged. No reset, clean, commit, push, rebase or existing-change deletion occurred. Other Codex processes were present, but no competing repository edits or HEAD changes were observed. `.env`, package manifests, lockfile, Next configuration and migration history were preserved.

Actual runtime: Node 24.21.0, pnpm 10.33.0, Next 16.4.0, React/React DOM 19.2.4, TypeScript 5.9.3, `pg` 8.20.0, OpenAI SDK 6.38.0, Playwright 1.60.0, Vitest 4.1.11, native PostgreSQL 18.6, pgvector 0.8.0, Mailpit 1.32.0 and tmux 3.7c. The repository requires Node >=20; Compose specifies PostgreSQL 16 and a different Mailpit version. Exact Docker-image acceptance was not rerun.

There are **44 migrations**, ending at `044_source_reviewer_deletion.sql`, and all 44 are applied to the running local database. Historical claims about 47 uncommitted Tranche C files do not describe this starting state.

The implementation remains a TypeScript modular monolith: one Next frontend/API deployment, plain PostgreSQL/pgvector persistence, and a separate Node worker sharing the same services/database. There is no Redis queue or separate AI backend. Key evidence:

| Boundary | Implementation |
|---|---|
| Durable ingestion and ordering | `src/lib/channels/inbox.ts:25`, `:91`; transactional messages/jobs, deduplication, leased claims and retries |
| Agent execution and ownership | `src/lib/channels/inbox-worker.ts:13`, `:31`; tenant/channel checks, human ownership and outcome recovery |
| Delivery and uncertainty | `src/lib/channels/outbox.ts:66`, `:102`, `:275`; durable idempotent sends, provider evidence and uncertain-send handling |
| Persistent worker | `scripts/worker.ts:29`; inbound, outbound, staff jobs and heartbeat |
| Tenant RAG and LLM | `src/lib/knowledge/retrieve.ts:5`; hybrid vector/text retrieval; `src/lib/llm/index.ts:57` selects mock/OpenAI/Azure/Anthropic |
| Restaurant branch | `src/lib/agent/engine.ts:127`; deterministic parsing/Chope assistance before model generation, not an LLM function call |
| Existing UIs | `src/components/shell.tsx:40`, `:47`; four business destinations and five operator destinations |
| Security and approvals | `src/lib/auth.ts:73`, `src/lib/staff-permissions.ts:5`, `src/lib/managed-approvals.ts:27`, `src/lib/assistant-drafts.ts:256` |

WhatsApp, Telegram, Instagram, Messenger and email adapters exist. Local fixture success does not establish real Meta authorization or recipient delivery. The existing business portal and operator frontend remain intact.

## 3. Local startup

Healthy existing services were reused. Only the worker was gracefully reloaded after verification to load the changed parser. PostgreSQL, Mailpit and web processes were preserved.

| Service | Local address / process |
|---|---|
| Next frontend/API | <http://localhost:3000/login>; loopback port 3000 |
| Liveness | <http://localhost:3000/api/health> — HTTP 200, `ok` |
| Readiness | <http://localhost:3000/api/readiness> — HTTP 200, `ready` |
| PostgreSQL | Loopback 55433, `pronto_test`; identity, local server address and comment marker verified |
| Durable worker | `pronto-local:worker`; heartbeat fresh, three new synthetic jobs completed |
| Mailpit | <http://localhost:8025>; loopback SMTP 1025; captured customer and staff messages |

These URLs work within WSL. Windows-browser localhost forwarding was not directly exercised from Windows; use the same localhost URLs where WSL forwarding is active. No network binding or Windows configuration was changed.

The tmux session is `pronto-local`, with `postgres`, `mailpit`, `web` and `worker` windows. Attach with `tmux attach -t pronto-local`. Logs are under `/tmp/pronto-local/logs`; for example, `tail -f /tmp/pronto-local/logs/worker.log`.

`/tmp/pronto-local/start-services` starts missing/stopped panes without duplicating healthy services. To restart a particular service, send Ctrl-C to its named pane, wait for `pane_dead=1`, then respawn it using its `/tmp/pronto-local/<service>.sh` wrapper. For the worker: `tmux respawn-pane -t pronto-local:worker /tmp/pronto-local/worker.sh` after graceful exit. `/tmp/pronto-local/stop-services` gracefully stops this local stack without dropping data. Do not stop unrelated sessions or system PostgreSQL services.

The existing synthetic operator/business demo accounts remain available through the local demo runbook. No credential values are reproduced here. `/tmp/pronto-local/send-escalation-demo` remains available for a fresh local refund demonstration.

Real AI is **not verified**. All development-provider keys were absent/empty, and the guarded demo worker explicitly forces mock AI. Real PostgreSQL retrieval still occurs. Log labels such as `openai` or a configured model name do not override the effective mock setting.

After the worker reload, the actual persistent local loop processed three new RFC822 enquiries:

| Synthetic enquiry | Result |
|---|---|
| Opening hours | `grounded_answer`; real tenant database retrieval with mock generation; reply captured by Mailpit |
| “Hi, can I reserve a table for two tomorrow around 7pm?” | Parsed as 26 October, 19:00, two people; existing outlet-link reply captured; normal Chope activation remains disabled |
| Missing item/refund | `complaint_or_refund`; conversation escalated, customer holding reply and staff notification captured |

The new handoff remains open at <http://localhost:3000/operator/clients/00000000-0000-4000-8000-00000000a101/conversations/02ff4dfa-b3e1-41c9-9368-afa1c1dad2a6>. These are synthetic local emails, not external mailbox or customer-account acceptance.

## 4. Chope capability matrix

| Capability | Classification | Evidence / limit |
|---|---|---|
| Tenant/outlet contract and Singapore request fields | Implemented and code/test verified | `src/lib/reservations/types.ts:10`; client/outlet/date/time/party |
| Required “tomorrow around 7pm” input | Implemented and runtime verified | Parser unit tests, DB worker fixture and persistent local worker |
| 24-hour times, party sizes and calendar rollover | Implemented and code/test verified | `chope.ts:52`; explicit times, today/tomorrow/ISO dates; Singapore midnight, New Year and leap-day tests |
| General natural-language booking dialogue | Partial | Single-message English patterns; missing data escalates rather than conducting a clarification dialogue; bare availability wording can still reach RAG |
| PS.Cafe Raffles City resolution | Implemented and runtime verified | Existing demo tenant maps to `pscaferafflescity1808psc`; no arbitrary restaurant discovery or Raffles Place substitution |
| Default Chope API adapter | Not implemented as a live API connector | `chope.ts:9`; availability and reservation operations unsupported; no supplied API contract |
| Browser availability through an agent job | Implemented and runtime verified | One controlled real read through `processInboundJob`, using a tenant-scoped injected connector |
| Automatic normal-worker Chope activation | Implemented and code/test verified | `chope-browser.ts:31`; both environment opt-ins plus matching enabled tenant profile; left disabled in the normal demo |
| Observed slots and timestamp | Implemented and runtime verified | One successful matching `get_times` POST and rendered options, described below |
| No availability, errors, timeout, stale/mismatched results | Implemented and code/test verified | Simulated browser transport and contract tests; no fresh live negative-slot call |
| No invented nearby slots | Implemented and code/test verified | Available response requires exact requested time in fresh validated observations |
| Customer-facing alternatives and freshness | Partial | Current reply does not list other observed times or include observation time; absent requested time falls through to the old generic outlet reply |
| Native listing query preselection | Implemented by provider; limited runtime verification | Four fresh-session GET probes retained tested selections; no product URL builder |
| Stable supported exact-link contract, expiry and downstream form | Unverified | No public integration specification found; booking form was not submitted/followed |
| Tenant scope and per-process throttling | Implemented and code/test verified | Tenant/outlet rejection before read; one-minute process-wide interval; not a shared multi-worker limiter |
| Create/read/update/cancel reservation operations | Not implemented; unsupported behavior tested | All four return unsupported; no reservation mutation performed |
| Broad permission/production acceptance | Unverified | Gabriel reaffirmed prior demo permission for this bounded read; the underlying agreement and broader operational terms were not independently inspected |

The controlled real job used the exact required sentence. At **25 October 2026 12:02:48 SGT**, the reader returned these times for **26 October, party of two**: **10:00, 10:15, 10:30, 10:45, 11:00, 11:15, 11:30, 12:30**. **19:00 was absent.** The observation has expired under the five-minute policy and must not be treated as current bookable inventory.

The real provider result reached the existing agent branch, which queued its existing non-confirming outlet-link response. No real LLM was invoked by this deterministic branch, no reservation was created, and the normal tenant was not permanently activated. This is stronger than the historical standalone listing read, but is not complete POC acceptance for exact links or real AI.

## 5. Exact booking URL findings

**DECISION GATE TRIGGERED: stable external exact-link support remains unverified. No exact-link builder, unsupported workaround or new general-link fallback was implemented. The old outlet-link code is preserved.**

The official PS.Cafe Raffles City page publishes:

```text
https://book.chope.co/booking?rid=pscaferafflescity1808psc&source=rest_pscafe
```

The research web tool observed a redirect to `booking.chope.co/booking_index` with `rid`, `source`, `adults=2`, language and country parameters, but could not render the destination. This alone proves neither exact-time support nor provider stability.

The authorized listing inspection then found Chope's own `formatDateQuery`, `formatTimeQuery` and `formatPeopleQuery` functions. They write `date`, `time`, `adults` and `children` into the listing URL. The page also passes the `time` query value as `selected_time` to its availability request. This mechanism was observed in provider source rather than guessed.

A research candidate derived from those native setters was:

```text
https://www.chope.co/singapore-restaurants/restaurant/ps-cafe-raffles-city?children=0&adults=2&date=2026-10-26&time=10%3A15+am
```

Fresh browser contexts with no initial cookies retained the date, non-default 10:15am selection and party sizes two and four. Two additional default-time trials also retained their selections. All these probes blocked further availability POSTs and booking submissions. The party-of-four probe tested preselection only; no party-of-four availability claim is supported.

What works now: query-based selection on the public restaurant listing, without a prior login or cookie jar in these trials. No opaque reservation identifier or expiry token appeared in this candidate.

What remains unverified: a stable supported third-party contract; behavior across other dates/devices and provider changes; whether an unavailable selected time is preserved or replaced after a fresh provider check; URL lifetime; and propagation into the downstream booking form. The listing exposes a GET form targeting `/booking/check`; it was deliberately not submitted, so no inventory hold or booking side effect was risked.

The limitation is **unknown contractual/compatibility support**, not proof that Chope cannot technically preselect fields. Chope's [affiliate page](https://www.chope.co/singapore-restaurants/pages/affiliateprogram) offers guided widget/cookie/API integration after acceptance. Its [website terms](https://www.chope.co/singapore-restaurants/tc) require written permission for specified reuse; public accessibility alone is not that permission. This report does not make a legal-compliance determination.

Gabriel needs to choose one next path:

1. Obtain confirmation of this native listing format and permitted use, then implement it against fresh exact-slot observations. This is the narrowest route to the original requirement.
2. Explicitly accept the observed native format as an experimental POC dependency, including compatibility monitoring and unknown downstream/expiry behavior.
3. Approve a disclosed general restaurant-link experience where the customer checks/reselects fields. Existing code already does this; no revised fallback experience was added here.

Research scripts and sanitized result metadata are under `/tmp/pronto-tranche00/provider-evidence`. `agent-read.json` records the real job/read, `listing-metadata.json` records the native form/source, and `fresh-url-results.json` / `nondefault-url-results.json` record the cookie-free trials. `live-agent-read.ts` makes a real request if explicitly opted in; do not casually rerun it. The fresh-URL probes deny availability POSTs and booking submissions. These temporary artifacts are not committed test contracts.

## 6. Code changes

| File | Change |
|---|---|
| `src/lib/reservations/chope.ts` | Accept “around”, explicit 24-hour times and number words through twenty; reject fractional/oversized parties; reject malformed/past slots and contradictory unavailable results |
| `src/lib/reservations/chope-browser.ts` | Treat contradictory time options as failure; block booking/booking-version hosts and booking paths, malformed encoded paths, credentialed URLs, query-bearing availability POSTs and duplicate required scope fields |
| `tests/unit/chope-connector.test.ts` | Parsing, timezone boundaries, missing fields, result provenance/freshness, malformed results and preserved URL behavior |
| `tests/unit/chope-browser.test.ts` | Contradictory/disabled options and all unsupported reservation operations |
| `tests/unit/chope-browser-read.test.ts` — new | Simulated Chromium orchestration, real reader rate/deadline logic, errors, cross-tenant denial and intercepted request boundary |
| `tests/integration/ps-cafe-demo.test.ts` | Required “tomorrow around 7pm” enquiry traverses durable worker with an injected deterministic availability reader |
| `docs/integrations/chope-live-read.md` | Dated real-read/preselection evidence, limitations and decision gate |
| `docs/poc/tranche00-verification.md` — new | This report and future implementation boundaries |

No source changes were made to authentication, permissions, approval architecture, frontends, provider credentials, model configuration or deployment. The same full migration inventory remains in place.

## 7. Testing

All results below were obtained during this tranche. `/tmp/pronto-tranche00/test-run` is a private environment wrapper selecting a newly initialized separate local `pronto_test` cluster on 55434. Its database name, loopback server address and `pronto:isolated-test-database:v1` marker were verified using repository safeguards before migrations, seed and DB tests. The port alone was never used as proof. The original demo database on 55433 was not reset or used for destructive fixture suites.

| Executed command | Current result |
|---|---|
| `pnpm test` before edits | 277 passed, 80 skipped, zero failed |
| `pnpm exec vitest run tests/unit/chope-connector.test.ts tests/unit/chope-browser.test.ts tests/unit/chope-browser-read.test.ts` | Final: 44 passed, zero failed/skipped |
| `pnpm test` after edits | 312 passed, 80 skipped, zero failed; 72 files passed, 13 skipped |
| `/tmp/pronto-tranche00/test-run pnpm test:db:verify` | Passed |
| Wrapper + `PRONTO_ALLOW_TEST_DB_MARK=1 pnpm test:db:mark`, then `pnpm migrate:test`, `pnpm seed:test` | Passed on the newly created cluster; all 44 migrations applied |
| `/tmp/pronto-tranche00/test-run pnpm test:db` | Final: 384 passed, 8 skipped, zero failed; 84 files passed, one skipped |
| `/tmp/pronto-tranche00/test-run pnpm test:local-mail` | 8 passed, zero failed/skipped; real loopback SMTP |
| `pnpm typecheck` | Passed, including final rerun |
| `pnpm lint` | Passed, including final rerun |
| Guarded `pnpm build` in an isolated source/dependency copy | Passed using Next's default Turbopack; mock AI and repository network guard; original dev build directory preserved |
| Guarded `pnpm exec playwright test` in that copy | 14 passed, zero failed/skipped; local-mail/staff modes, isolated DB and localhost:3001 |
| Original running UI browser smoke | 11 routes HTTP 200; 273 CSS/JS responses without failures; zero page/console errors or horizontal-overflow findings |
| Three synthetic enquiries through reloaded persistent worker | Three completed jobs, three captured customer replies, one captured staff notification; refund handoff open |
| Opt-in real Chope agent read | One matching successful availability POST; eight observed times; no reservation operation |
| Fresh native URL probes | Four HTTP 200 cookie-free contexts; tested selections retained; no additional availability POST allowed |
| `git diff --check` | Passed |

The normal suite gained **35 tests** over the entry baseline. Skipped DB/local-mail suites remain skipped in ordinary `pnpm test`; the DB-inclusive command still skips Mailpit-dependent cases unless opted in.

The first DB run returned 382 passed, one failed and eight skipped: a preflight subprocess test exceeded its existing five-second timeout while the build/dependency-copy workload was running. The five-test readiness file passed separately, and the complete final default-timeout rerun passed 384/8. One new negative unit case was added between those runs, explaining the additional case. No timeout configuration or unrelated application code was changed to force a pass.

The first attempt to hard-link dependencies into `/tmp` failed because `/tmp` is a different filesystem. Ordinary copying resolved that setup issue; the completed guarded build used the copy. The temporary E2E config, test URLs and network guard were adapted to port 3001 because the healthy original web service occupied 3000; these adaptations were confined to the copy. The normal browser script was not run against the original demo database.

The temporary 55434 test server and temporary E2E web server were stopped after verification; their data/evidence remains private under `/tmp/pronto-tranche00`. The original `pronto-local` application remains running. Coverage, Docker acceptance, real LLM inference, Meta account activation and production email acceptance were not rerun/claimed.

## 8. Remaining blockers

1. **Product/provider decision — high impact:** exact native URL preselection works in the limited listing trials, but stable external support/downstream semantics are not established. Resolve section 5 before changing the link experience.
2. **Engineering configuration — high impact:** real development LLM and embedding credentials are missing. The revised POC explicitly requires real AI; current mock acceptance cannot meet that criterion.
3. **Engineering — medium impact:** availability status/freshness and alternative observed times are not fully expressed in customer replies; an absent requested slot returns the old generic outlet reply. Address this together with the approved exact-link behavior.
4. **Provider/operations — medium impact before broader activation:** retain single-worker read limits until contractual rate/caching bounds and any shared limiter requirement are established. This bounded authorized run does not prove broad permission or multi-worker safety.
5. **Administrative dependencies for later tranches:** legitimate Instagram Professional test identity/access, protected-demo hosting/budget, and authorized staff-support messaging remain separate decisions. No account creation, provisioning or real customer-channel sends occurred.

No new P0 data-integrity defect was established in the bounded checks. This is not a production-readiness or legal-compliance claim.

## 9. Suggested next Codex tranche

The smallest next engineering step is **PRON-86 with real AI credentials**, while resolving the Chope decision separately: add the labeled unofficial customer simulator to the existing ingestion/worker/database flow and connect it to the existing business conversation/handoff views. Preserve the existing tenant and capability checks. Do not make the simulator impersonate PS.Cafe's Instagram account.

| Later work | Reuse / dependency boundary |
|---|---|
| PRON-86 customer/business POC | `channels/inbox.ts`, `inbox-worker.ts`, outbox, existing `client` conversation components and escalation APIs. Add a bounded synthetic customer transport; do not call the agent directly from a cosmetic chat component. |
| PRON-7 triage preparation | Current answer/escalate path and escalation policies exist; two independent AI-response/owner-action axes and short/long urgency policy are not already complete merely because handoff exists. |
| PRON-87 operator removal | Inventory found 19 operator page files and 26 operator API route files. UI removal is separate from backend removal. Keep auth/RBAC, onboarding, source review/publication, activation evidence, staff grants, audit and offboarding services. |
| PRON-87 dependency hazards | `shell.tsx`, operator navigation/sidebar, login/root redirects, operator forms/shared panels, `integrations-panel.tsx`, notification action links in `escalations.ts:118`, and UI tests reference operator routes. Provide a trusted setup/admin path before deleting their only frontend; owner roles must not inherit operator authority. |
| PRON-88 protected hosting | Existing Docker runner/worker/optional Chromium-worker targets and health/readiness routes. Preserve a persistent worker plus PostgreSQL/pgvector; assess platform/budget before provisioning. Mailpit/local SMTP is a local-development facility, not hosted provider acceptance. |
| PRON-40/59/60 Instagram | Existing `channels/instagram-login.ts`, webhook, dispatch, encrypted drafts and account binding. Provision a legitimate test identity, then separately prove inbound webhook, actual inference, provider acceptance and visible test-recipient receipt. |
| PRON-89 Eatigo/Oddle | Existing reservation types can inform reuse after each provider's independent capability/permission review. No connector or generic framework was added. |
| PRON-90 recaps | Reuse reporting aggregates, staff destinations, existing worker scheduling/deduplication patterns and tenant checks. Current escalation reminders are not a daily/weekly recap generator or stored recap history. |

Suggested order: unblock real AI and the Chope decision; PRON-86 plus required PRON-7 behavior; PRON-87 after trusted admin/setup dependency review; PRON-88 after local acceptance. Instagram account preparation can proceed independently, followed by controlled real DM receipt/reply. Then evaluate Eatigo/Oddle and recaps separately. No later-tranche features were built here.

## 10. ChatGPT handover

As of 25 October 2026, Pronto is an existing Next 16.4/React 19.2/TypeScript modular monolith with PostgreSQL/pgvector and a separate durable Node worker. The repository began clean on main at 34bb86e, with migrations 001–044 already committed. Historical uncommitted Tranche C file counts were stale. This tranche leaves eight unstaged changed/new files and no migration, package, environment or permission-architecture changes.

The complete local stack remains usable at localhost:3000, with Mailpit at localhost:8025, PostgreSQL on loopback 55433 and tmux session pronto-local. Health/readiness and a fresh worker heartbeat pass. The worker was gracefully reloaded for the parser change. Three fresh synthetic emails demonstrated tenant RAG with mock generation, booking-intent routing, and refund escalation with customer holding reply and staff email. Existing messages and the earlier demo were preserved. Windows forwarding was not directly verified from Windows.

No real AI provider key is configured. The current demo worker forces mock AI, even when telemetry labels a nominal provider/model. Therefore the revised requirement for unscripted genuine AI responses is not yet satisfied. The existing four-destination business portal and five-destination operator frontend are implemented; the new Instagram-style customer simulator is not. Operator removal must preserve backend approvals and administrative services.

Chope is not an authorized API integration in this repository. A separate scoped browser reader exists, with dual environment opt-ins, tenant activation settings, a one-minute per-process limit, provisional timestamped observations and no reservation operations. Its parser now handles the supplied “reserve a table for two tomorrow around 7pm” example, explicit 24-hour times and additional party sizes. New checks reject malformed/stale/mismatched/contradictory observations and strengthen the browser's read-only boundary. Missing parameters still escalate; arbitrary natural-language follow-up or venue discovery is not implemented.

After Gabriel reaffirmed prior demo authorization, one controlled synthetic durable job called the real Chope reader via the existing worker function and a scoped injected connector. At 12:02:48 SGT it observed eight times for PS.Cafe Raffles City on 26 October, party of two: 10:00, 10:15, 10:30, 10:45, 11:00, 11:15, 11:30 and 12:30. 19:00 was absent. These observations are expired. The existing generic outlet-link reply was queued; this was neither model inference nor a confirmed reservation, and automatic normal-worker Chope activation remains disabled.

New provider evidence shows native listing query preselection: date, time, adults and children are written by Chope's own JavaScript. Four fresh-cookie-free browser trials retained tested date/time/party selections, including non-default 10:15am and party size four. No additional availability POSTs or booking submissions were allowed in those trials. Party-of-four availability was not checked. This is current listing behavior, not proof of stable third-party URL support, URL expiry semantics, inventory holds or downstream booking-form propagation. Exact-link product implementation remains paused for Gabriel's decision; no builder, unsupported workaround or revised general-link fallback was added. The pre-existing fallback remains in code.

Current acceptance: normal tests 312 passed/80 skipped; guarded DB tests 384 passed/8 skipped; focused Chope tests 44 passed; local SMTP tests 8 passed; adapted isolated browser acceptance 14 passed; lint, typecheck and guarded build passed. An initial resource-contention preflight timeout passed both focused and complete reruns. A temporary separate identity-marked test database protected the interactive demo; it and the temporary E2E server are now stopped. No real Meta or external email delivery, production deployment or production readiness is claimed.

Technical priorities should remain narrow: obtain real AI development credentials; resolve whether to use the demonstrated native listing parameters as an experimental POC dependency, obtain provider confirmation, or approve a disclosed general-link experience; then build PRON-86 on the existing durable backend and business portal. Keep the operator UI until its dependency audit is acted on in PRON-87. Reuse PostgreSQL and the worker for future scheduling/recaps; do not introduce another agent backend, logging service or speculative multi-provider subsystem.
