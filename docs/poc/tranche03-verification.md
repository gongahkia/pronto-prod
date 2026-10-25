# Tranche 03 — real AI acceptance and hosted POC readiness

25 October 2026. Repository `/home/gongahkia/coding/projects/pronto-app`.
This report describes checks rerun in this tranche, separately from historical
Tranche 01/02 results. No Jira/Confluence changes, cloud provisioning/deployment,
real Meta sends, new Chope reads or reservation operations occurred.

## 1. Executive verdict — PARTIAL

**Local connected POC regression: PASS. Genuine external LLM acceptance: BLOCKED
by missing development credentials and explicit opt-in. PRON-88 plan: prepared;
hosted implementation/deployment: not accepted.**

The running customer simulator and business inbox passed the complete mock/customer
and human-response walkthrough. The existing database, separate durable worker and
Mailpit were preserved. All 26 browser regression scenarios passed in one clean
invocation, including the administrative CLI replacement and error recovery.
No new application defect requiring a code fix was found.

Real mode returned an explicit HTTP 503 naming `OPENAI_API_KEY`; no mock session
was substituted. Neither web nor worker has any OpenAI/Azure/Anthropic key, and
the optional approved real-AI file is absent. No external inference or embedding
preparation was attempted. A configured model name, a successful mock reply, an
estimated usage record, or a stubbed real-mode test is not external acceptance.

The concrete [protected-hosted POC plan](protected-hosted-poc-plan.md) recommends
Render web + worker + managed pgvector Postgres in Singapore. Minimum experiment
budget is approximately $21–22/month; the recommended configuration approximately
$52–53/month before AI/tax/overages, or $77–78 with a multi-administrator Pro
workspace. These are calculated planning estimates, not cloud benchmarks.

## 2. Actual Git and runtime state

| Item | Verified result |
|---|---|
| Branch / HEAD | `main` / `edceea03dbce17c03b4572e5976f7895ef5d2dae` |
| Entry worktree | 0 staged; 1 modified tracked file: `docs/poc/tranche02-verification.md`; 0 untracked |
| Preserved existing work | Tranche 02 report captured privately and SHA-256 checked unchanged after verification |
| Tranche 03 changes | Two new documentation files: this report and `docs/poc/protected-hosted-poc-plan.md` |
| Source / configuration / migrations | No tracked application, test, package, environment, Docker or migration changes |
| Toolchain | Node 24.21.0; pnpm 10.33.0; Next 16.4.0; React 19.2.4; installed TypeScript 5.9.3 |
| Migration inventory | 45 files, through `045_customer_simulator_and_triage.sql`; main database reports that migration applied |
| Main database | Native PostgreSQL 18.6 + vector extension 0.8.0; existing local persistent `pronto_test`, port 55433 |
| Stack | Existing `pronto-local` tmux session: `postgres`, `mailpit`, `web`, `worker`; all preserved |
| Regression database | Separately owned `/tmp/pronto-tranche00/pgdata`, loopback 55434; started for guarded verification and safely stopped afterward, not the persistent demo database |

The runtime remains the existing Next.js modular application with internal
TypeScript services, PostgreSQL/pgvector, durable inbound/outbound queues and a
separate `scripts/worker.ts` daemon. The simulator uses an authenticated synthetic
`console` channel and the same persisted conversations as the tenant business UI.
Administrative UI routes remain removed; backend APIs and CLI remain protected.

The reported Tranche 02 HEAD is correct, but the modified completed Tranche 02
report is outside that commit. The tested source was the actual current worktree,
not inferred from a commit description. No conflicting Pronto source writer was
observed; unrelated builds in other projects were left alone.

## 3. Local access and services

- Customer: <http://localhost:3000/demo/customer>.
- Business inbox: <http://localhost:3000/client/inbox>.
- Sign-in: <http://localhost:3000/login>; use the authorized PS.Cafe responder
  `responder@ps-cafe-demo.test` from [the local fixture guide](../demos/ps-cafe-raffles-city.md).
  Passwords are not repeated here. Select **Mock** while real credentials are absent.
- Mailpit: <http://localhost:8025>; local SMTP 1025.
- Health: <http://localhost:3000/api/health>; readiness:
  <http://localhost:3000/api/readiness>. Both returned 200; authenticated operation
  inspection reported a fresh worker heartbeat.
- Operator identity page: `/account`; business access requires a separate business
  session. Tabs in a browser profile share cookies. Use separate profiles/private
  contexts for simultaneous operator and responder sessions.

Reconnect with `tmux attach -t pronto-local`. Web/worker logs are
`/tmp/pronto-tranche01/logs/web.log` and `worker.log`; PostgreSQL/Mailpit logs are
under `/tmp/pronto-local/logs`. For example:

```sh
tail -f /tmp/pronto-tranche01/logs/web.log /tmp/pronto-tranche01/logs/worker.log
```

The existing `/tmp/pronto-tranche01/restart-app` gracefully restarts only the
known web/worker panes with their current wrappers, preserving PostgreSQL and
Mailpit. `/tmp/pronto-local/start-services` preserves healthy services. To stop
this owned stack later, its existing `/tmp/pronto-local/stop-services` wrapper
targets only the recorded services and stops the owned database without dropping
it; **it was not run**. Do not run seed/setup/removal merely to revisit the UI.
These `/tmp` wrappers/data are local session artifacts, not durable host setup.

Chromium acceptance ran inside WSL against the actual localhost application.
The pages were visually inspected from screenshots. Windows Chrome's own profile
and WSL forwarding were not independently exercised this tranche. No claim is
made that the earlier unreproduced Windows hang or DevTools filesystem warning
has an established application root cause.

## 4. Genuine external AI — blocked, with exact local recovery procedure

Redacted presence checks found all three provider keys empty in repository `.env`
and absent from the effective running web/worker environments. The owned optional
`/tmp/pronto-tranche01/real-ai.env` file does not exist; neither process has
`PRONTO_DEMO_REAL_AI_APPROVED=1`.

The PS.Cafe tenant config selects OpenAI `gpt-5.5` and OpenAI
`text-embedding-3-small`. These are configuration values, not provider/model
entitlement evidence. Its three current nonarchived knowledge chunks have no real
`embeddingProvider` provenance. The embedding-model column alone does not make
deterministic seed vectors genuine embeddings.

Relevant implementation evidence:

- `src/lib/customer-demo-ai.ts:7`: real provider configuration and missing-key checks;
  `requireRealDemoConfiguration` also requires matching real-vector provenance.
- `src/lib/llm/execution-mode.ts` and `src/lib/env.ts:37`: immutable session/job
  real/mock context overrides the global default independently.
- `src/lib/customer-demo.ts:21`: Real session creation validates provider/knowledge
  before inserting a session; actor ownership and tenant identity remain enforced.
- `src/lib/customer-demo-setup.ts:25`: existing real embedding preparation updates
  current demo vectors/provenance transactionally with an audit event.
- `src/lib/llm/openai.ts:139`: actual Responses API generation path, structured
  decisions, no stored provider response (`store: false`), output/timeout limits.
- `src/lib/agent/engine.ts:492`: generation followed by cited-chunk filtering
  and provider-or-estimated usage capture; `src/lib/agent/trace.ts` stores source
  IDs/scores, model metadata and prompt hash rather than full prompt text.

### Secure setup for Gabriel on this existing local stack

Do not paste a key into chat, shell arguments/history, source, test logs or Git.
Use a local editor and an owned private mode-600 file. The launch directory is
already private. Create the file **only if it does not exist**:

```sh
test ! -e /tmp/pronto-tranche01/real-ai.env && (
  umask 077
  set -C
  : > /tmp/pronto-tranche01/real-ai.env
)
```

If it already exists, inspect ownership/mode and edit it without replacing its
contents. Do not follow an unexpected symlink. In the local editor, supply:

```sh
export PRONTO_DEMO_REAL_AI_APPROVED=1
export PRONTO_LLM_PROVIDER=openai
export PRONTO_EMBEDDING_PROVIDER=openai
export OPENAI_API_KEY='ENTER_ONLY_IN_YOUR_LOCAL_EDITOR'
# Optional: OPENAI_RESPONSE_MODEL for an account-enabled response model.
# Optional: PRONTO_EMBEDDING_MODEL; changing it requires preparing vectors again.
```

The shown string is a placeholder, not a credential. Use an existing approved
development provider project and its spending controls. Leave the global mock
default available: per-session Real mode overrides it without changing Mock
sessions. Do not set an alternative API base URL unless deliberately approved.
The launcher validates a regular, owned file with mode exactly 600, requires the
opt-in, and passes settings to both processes. Supported alternatives are Azure
(`AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_RESPONSE_DEPLOYMENT`
or `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_EMBEDDING_DEPLOYMENT`, both provider
selectors `azure`) or Anthropic (`ANTHROPIC_API_KEY`, response selector `anthropic`,
optional `ANTHROPIC_RESPONSE_MODEL`) with separate OpenAI/Azure embeddings.
Use **`PRONTO_EMBEDDING_MODEL`** for the runtime override; an environment variable
named `OPENAI_EMBEDDING_MODEL` alone is not read by this preparation path.

After setting private provider values and confirming the explicit paid-call opt-in:

```sh
# Existing guarded procedure: currently three published demo chunks in one batch.
/tmp/pronto-tranche01/app-run pnpm demo:customer:embed
# Restart only web and worker with those same settings.
/tmp/pronto-tranche01/restart-app
```

No database seed, reset, migration or fixture removal is required. The real launch
wrapper removes the test socket guard only for this explicit configuration,
keeps `PRONTO_DEMO_ONLY_DELIVERY=1`, and forces both Chope live-read flags off.
Automated test wrappers remain isolated, mocked and network guarded.

Create **one new Real AI conversation**, then ask a substantive question such as:
“What are your usual opening and closing times, when are last food orders, and
where is the Raffles City outlet? Please distinguish public-holiday uncertainty.”
Avoid a greeting, booking request or escalation-only policy branch as inference
proof. Verify all of:

1. UI labels the delivered reply **real model response**, and business inbox shows
   the same persisted enquiry and answer.
2. Sanitized worker evidence includes successful real embedding/generation calls
   correlated to that conversation, with selected provider/model and no mocks.
3. Trace cites this tenant's current published chunks, includes source IDs and a
   prompt hash, and usage reports provider tokens when returned. Inspect selected
   fields only; do not dump prompts, source contents, keys or cookies.
4. One completed inbound job and delivered synthetic outbox reply are present;
   no external channel was contacted. Mock mode continues independently.

Existing defaults bound generation to 800 output tokens and 25 seconds, with
6,000 prompt / 8,000 conversation token caps. Simulator limits include 20 new
sessions/hour, 10 customer messages/minute and bounded retries. These controls
are not a monetary billing cap. No provider charge was incurred by this tranche.

## 5. Customer/business browser acceptance

Main-stack evidence: `/tmp/pronto-tranche03/runtime.json`, screenshots under
`/tmp/pronto-tranche03/screenshots`, sanitized SQL in
`/tmp/pronto-tranche03/logs/evidence.json`.

The synthetic session was `98f963b2-6583-4753-9d0d-556c038a19ae`, conversation
`16a043c5-e799-4b8c-bc5f-a7ccb4fefd3b` in the PS.Cafe demo tenant.

| Scenario exercised now | Actual result |
|---|---|
| Responder → `/demo/customer`, explicit Mock session, hours enquiry | Durable worker produced fixture-grounded 10:00pm closing answer; not scripted in the UI |
| **Open business inbox** | Actual `/client/inbox` heading and matching persisted conversation rendered; loading skeleton absent |
| Classification / ownership | Inbox/detail displayed AI responds yes initially; takeover changed AI responds to no |
| Owner manual response | “Thanks for checking. Our demo team can help with your enquiry.” persisted and appeared in the customer tab |
| Resolution / release | Customer showed resolved-but-AI-paused guidance; only explicit release restored active input |
| Refresh / shared tabs | Real inbox remained visible after refresh; sign-out invalidated other tab access; API returned 401 |
| Operator navigation | Explicit business-role/account-switching explanation; no operator dashboard redirect or business impersonation |
| Operator business mutation | HTTP 403; no role/tenant elevation |
| Retired frontend | `/operator`, `/operator/inbox`, `/operator/businesses`, `/operator/operations` returned 404; full suite also checks all former major destinations |
| Health / readiness / worker | HTTP 200 / 200 and `workerFresh=true` |
| Frontend assets / runtime | 297 successful asset responses, zero asset failures, zero console/page errors in the main-stack walkthrough |

Read-only database confirmation found one completed inbound job, two sent outbox
rows (one mock AI answer and one human reply), final active state with
`ai_should_respond=true`, `owner_action_required=false`, `urgency=long_term`.
Its answered trace reports response provider/model **mock/mock**, embedding
provider **mock**, three retrieved chunks and one cited chunk. Generation usage
is **estimated**: 784 input / 75 output tokens. Embedding usage is also mock.
The embedding-model label still says `text-embedding-3-small`; provider and
provenance prove why that label is not real inference evidence.

The separately guarded 26-case browser suite additionally passed missing
membership/capability, expired session, authorized responder cross-tenant read and
takeover denial, real-mode missing credentials without mock substitution, anonymous
and other-tenant simulator denial, slow reads, a real 30-second SQL timeout and
successful read-only retry, aborted client navigation/full-page recovery, mobile
and keyboard navigation, synthetic knowledge approvals and local email handoff.
Worker/backlog tests prove no automated answer while human-owned or to the queued
human-owned backlog after release. These exercised PostgreSQL and application
code, with explicit mock LLMs and guarded transports.

### Business Inbox Navigation and Loading Investigation

Tranche 02's corrected role navigation and Next 16.4 `retry()` recovery remain
working. This tranche reproduced neither the original Windows-only stuck inbox
nor its DevTools workspace warning; neither was treated as a fresh defect or an
established root cause. Actual responder pages rendered; deliberately failed
database reads produced an actionable error and recovered through retry. The
injected timeout and RSC fetch-error messages in the **isolated browser log** are
expected failure-path diagnostics, not errors from the healthy main walkthrough.

## 6. Administrative backend / PRON-87

The clean browser suite executed the actual `pnpm admin` transport through
authenticated HTTP APIs. Its essential-workflow case passed draft business
creation, five-stage onboarding, separate business approvals, exact source/version
approval, private assistant test, publication, local channel activation with gates,
audit checks, encrypted synthetic integration credential save/inspect/delete and
logout. All mutations affected the verified disposable regression database;
provider health/activation was synthetic/local, never a real provider.

Anonymous and business users cannot inspect operator diagnostics. Operator sessions
cannot mutate the business inbox through client APIs, and no implicit privileges
were added. The CLI does not bypass the database/permissions layer or mint sessions.
See [operator CLI](../ops/operator-cli.md). PRON-87's local acceptance remains
verified; no operator frontend was restored or additional administrative UI removed.

## 7. Commands and test results rerun now

All DB writes/cleanup from suites were limited to the **separate** owned regression
cluster on 55434 after `test:db:verify` confirmed matching explicit URLs, loopback
server, database identity and marker. Port alone was never accepted as proof.
No migrations, seeds, removals or destructive suites were run on persistent 55433.
The healthy main application only received the bounded authenticated synthetic
walkthrough and read-only diagnostic queries.

| Exact command / execution | Result |
|---|---|
| `pnpm test --maxWorkers=2` | **409 passed, 93 skipped, 0 failed**; 81 passing / 15 skipped files; 502 total tests |
| `pg_ctl -D /tmp/pronto-tranche00/pgdata -l /tmp/pronto-tranche03/logs/test-postgres.log -w start` | Started previously stopped, separately owned regression cluster |
| `/tmp/pronto-tranche00/test-run pnpm test:db:verify` | PASS: isolated test database verified |
| `/tmp/pronto-tranche00/test-run pnpm test:db --maxWorkers=2` | **494 passed, 8 skipped, 0 failed**; 95 passing / 1 skipped files; 502 total tests |
| `/tmp/pronto-tranche00/test-run pnpm test:local-mail` | **8 passed, 0 skipped, 0 failed**; actual loopback SMTP/Mailpit |
| `/tmp/pronto-tranche03/e2e` | **26 passed, 0 skipped, 0 failed**, one clean invocation, 2.9 minutes |
| `TMPDIR=/var/tmp node /tmp/pronto-tranche03/runtime.cjs` | PASS against persistent localhost:3000; full mock/human round trip and auth checks |
| `pnpm lint` | PASS |
| `pnpm exec next typegen` then `pnpm typecheck` | PASS / PASS |
| Guarded shadow build, exact command below | **PASS**; optimized Next 16.4 build, TypeScript and all 63 generated pages completed; retired operator UI absent |
| `git diff --check` | PASS; repeated before handover |

The private E2E wrapper invokes `pnpm exec playwright test --workers=1` in
`/var/tmp/pronto-tranche03-app` with the verified regression database, web origin
`http://localhost:3001`, mock AI, local SMTP/staff-command flags, customer simulator
and synthetic-only delivery enabled, and
`NODE_OPTIONS=--import=./tests/setup/network-guard.mjs`. Playwright starts/stops its
own guarded Next server and an owned test worker. It does not attach tests to the
persistent user's stack. Only shadow configuration/guard test port references
change from 3000 to 3001; application source/scripts are identical to the worktree.
Installed dependencies were hardlinked into that private copy without modification.

The guarded production build command is:

```sh
PRONTO_TRANCHE_WORKDIR=/var/tmp/pronto-tranche03-app \
  /tmp/pronto-tranche00/test-run env \
  APP_BASE_URL=http://localhost:3001 PRONTO_TEST_ALLOW_BUILD_IPC=1 \
  NODE_OPTIONS=--import=./tests/setup/network-guard.mjs pnpm build
```

This leaves the running application's `.next` artifacts intact. The build verifies
compilation/types/routes, not production-mode simulator availability or a container
launch. Docker image building, cloud TLS/secret injection and hosted acceptance
were not performed. Coverage was not rerun; historical percentages are not new
Tranche 03 evidence. Unit/DB/local-mail counts match Tranche 02; the browser result
is now one clean 26-pass run rather than a full run plus a corrected targeted case.

Logs are private under `/tmp/pronto-tranche03/logs`. A temporary read-only SQL
probe initially referenced a nonexistent `ai_paused` column; the diagnostic was
corrected to the actual status/classification fields, with no database or source
change. It was not an application defect.

## 8. Changes, remaining blockers and deployment approvals

Only new files:

- `docs/poc/tranche03-verification.md`: current evidence, exact real-AI setup,
  regression results and handover.
- `docs/poc/protected-hosted-poc-plan.md`: current vendor comparison, configuration,
  minimum protected-demo changes, sequence, migration/rollback/recovery and
  acceptance criteria with primary-source links.

No regression fixes or new application features were needed. The existing modified
Tranche 02 report was preserved. No secrets/environment file was created or
overwritten, nor any permission/approval boundary changed.

| Blocker / priority | Owner / smallest next action |
|---|---|
| **P1: PRON-86 genuine inference not accepted** | Gabriel configures an approved development key privately and explicit opt-in; rerun three-chunk preparation and one substantive conversation with real evidence. No chat credential request. |
| **P1: hosted simulator intentionally rejects production/nonlocal DB** | Engineering: separate protected-demo identity profile, startup/preflight and safe fixture/embedding/bootstrap path, preserving destructive-test guards. |
| **P1 before internet exposure: development fixture credentials and unthrottled login** | Engineering: strong named-user bootstrap and bounded login throttling; optionally an approved whole-host identity gateway. Never upload default seed accounts. |
| **P1 before resource creation: budget/access/account decisions** | Gabriel approves chosen host/region, monthly budget, LLM project/spend controls, named demo users and retention/access policy. Provision/deploy only afterward. |
| **P2: container/migration/worker cloud verification** | Engineering: explicit runner/worker targets, consistent tested runtime, migration artifact and serialized connection, worker SIGTERM/reclaim, HTTPS/TLS and restore acceptance. |
| **Existing external acceptance limits** | No new Meta/Chope permission or activation established. Experimental Chope listing links preserved; downstream booking-form selection still unverified. |

Business registration, real provider-account provisioning, restaurant authorization
and legal/policy decisions are separate from this synthetic hosted POC. No real
business pilot or production security/compliance claim is made.

**PRON-86 closure recommendation:** keep open pending real external LLM + genuine
embedding + shared UI acceptance. The connected frontend/worker/mock/human portion
is verified. **PRON-87:** local replacement/regression verified; unchanged this
tranche. **PRON-88:** concrete plan prepared; implementation and deployment require
the listed work/approvals. No ticket statuses were changed.

## 9. Self-contained ChatGPT handover

On 25 October 2026 Pronto is on `main`, HEAD
`edceea03dbce17c03b4572e5976f7895ef5d2dae`, with migrations through 045. Entry Git
state had only the modified completed Tranche 02 report; this tranche preserved
that file and added two documentation files without changing application source,
tests, secrets or schema. No commit/push, cloud provisioning, deployment, Jira or
Confluence update occurred.

The running stack is Next 16.4.0/React 19.2.4/TypeScript on Node 24.21.0, native
PostgreSQL 18.6 with pgvector 0.8.0, durable PostgreSQL inbox/outbox, a separate
background worker and local Mailpit. It remains in tmux `pronto-local`, web
localhost:3000 and Mailpit localhost:8025. Customer `/demo/customer` and business
`/client/inbox` share persisted tenant conversation state. An authorized PS.Cafe
Raffles City demo responder successfully sent a mock enquiry, saw the tenant RAG
answer, navigated to the real inbox, took over, replied manually, saw that reply
on the customer tab and explicitly released to AI. Operators receive an explicit
account-switching explanation and are denied business mutations; there is no
operator-to-business role elevation.

All 26 browser checks now pass in one run, including authenticated administrative
CLI workflows with independent business approvals, cross-tenant denial, missing
membership/capability, expired sessions, slow database reads, actual SQL timeout
and working retry, navigation recovery and local email handoff. Unit tests are
409 passed/93 skipped, DB-inclusive 494 passed/8 skipped, local mail 8 passed;
lint, typecheck and the guarded production build passed. The original Windows
skeleton/DevTools warning was not reproduced and remains an unestablished root cause. Operator frontend stays
removed; essential backend and CLI protections remain intact.

**Genuine external AI has still not been verified.** Effective web/worker keys
and `.env` provider keys are empty, and no explicit real-AI opt-in exists. New
Real sessions fail HTTP 503 naming `OPENAI_API_KEY` with no mock substitution.
Tenant model configuration says OpenAI gpt-5.5/text-embedding-3-small, but current
vectors are deterministic and have no real provider provenance. The successful
conversation's trace explicitly identifies mock generation/embeddings and
estimated tokens. No provider charge or live inference occurred. PRON-86 should
remain open until Gabriel privately configures a development key/opt-in, runs the
existing real-vector command and verifies one substantive generated answer in
both UIs with actual provider and tenant-grounding evidence.

PRON-88 has a concrete plan, not an accepted deployment. Recommend Render web,
separate worker and managed pgvector Postgres in Singapore: roughly $52–53/month
for 2 GB web/512 MB worker/1 GB DB plus conservative storage allowance, excluding
LLM, tax and overages; add $25 for a multi-administrator workspace if required.
Vercel Pro plus Render worker/DB is roughly $47–48 before network/access extras,
but adds cross-vendor database/pooling concerns. Railway can be roughly $20–30
under explicit low-usage assumptions, not a guaranteed $5 three-service stack.
Current Vercel account protection is free for all deployments since September
2026; older $150-protection assumptions are outdated.

Current simulator guards deliberately reject production and nonlocal test DBs;
the supported test verifier must not be weakened to host it. Implement a separate
protected-demo identity profile, safe synthetic bootstrap with strong named-user
credentials, login throttling, demo-aware preflight and production-mode negative
tests, then validate container/migration/worker shutdown/restore behavior. Preserve
tenant permissions, approvals, synthetic-only delivery, immutable real/mock mode
and real-channel deactivation. Do not deploy `next dev`, reuse default fixture
passwords or attach regression tests to a hosted database. Cloud provisioning,
billing and access invitations require Gabriel's approval.

Chope experimental listing links and fallback are unchanged. No new live read,
booking write, real Instagram/Meta send or provider-account authorization was
performed. These remain distinct acceptance gates. The next useful work is the
bounded real-AI check once configured, followed by the protected-demo boundary
tranche; optional connectors, recaps and architecture rewrites are not priorities.

## 10. Final handover checks

The optimized build passed. Byte comparisons confirmed all `src`, `scripts` and
`db` files in the isolated build/browser copy match the current repository.
The pre-existing modified Tranche 02 report's SHA-256 remains unchanged.

After tests, the separate regression database had no other client connections;
it was safely stopped without deleting its data. Port 3001's owned test server
and test worker exited. The existing `pronto-local` PostgreSQL, Mailpit, web and
worker panes remained alive with their original PIDs. Final health/readiness and
Mailpit checks returned 200. No source/environment change or main-stack restart
was necessary.

Final Git state: `main`, unchanged HEAD; **0 staged, 1 pre-existing modified
tracked file, 2 new untracked documentation files**. `git diff --check` passed.
No stage, commit, push, reset, clean, production migration or external provider
operation occurred. Local app **PASS**; real AI **BLOCKED**; PRON-86 **PARTIAL**;
PRON-87 local regression **PASS**; PRON-88 **PLANNED, NOT DEPLOYED**.
