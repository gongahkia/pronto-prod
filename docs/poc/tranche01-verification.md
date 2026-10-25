# Pronto POC Tranche 01 — connected customer and business demonstration

25 October 2026, Asia/Singapore. Repository: `/home/gongahkia/coding/projects/pronto-app`.

## A. Executive verdict

**PARTIAL.** PRON-86 now has a working authenticated customer simulator connected
to the existing durable backend and business inbox. Actual PostgreSQL, worker,
RAG retrieval, synthetic outbound delivery, human takeover, manual reply and
explicit release have been exercised. **A genuine external LLM response has not
been generated: development provider credentials are absent.** Selecting Real AI
fails clearly; mock responses require explicit selection and carry a label.

No real Instagram integration, Chope deep-link change, additional Chope read,
operator removal, deployment or external customer message was performed. This is
local POC acceptance with a remaining real-inference gate, not pilot or production
acceptance.

## B. Implementation summary

The new `/demo/customer` page provides an Instagram-inspired DM layout for the
unofficial PS.Cafe Raffles City demo, saved histories, input, message bubbles,
processing/delivery indicators, timeout/error/retry states, clickable existing
booking links and explicit human-handoff messaging. It is an authenticated,
development-only interface, not a public inbound webhook.

`POST /api/demo/customer` creates an actor-owned session or feeds the existing
`ingestInboundMessage` service. Messages and jobs persist in PostgreSQL. The
existing worker executes the agent and tenant RAG, then the existing outbox
delivers to the synthetic `console` channel. That database enum already existed;
it was not added to the real-provider activation catalog. Customer history exposes
business replies only after the outbox reaches `sent`.

The existing `/client/inbox` and conversation detail now show AI response,
independent owner action and short-term/long-term urgency, with pending,
AI-handled and resolved filters. Authorized staff can adjust classification,
take over, use the existing manual-reply/resolution flow and explicitly release.
Customer polling runs every 2.5 seconds and inbox/detail refresh every 3 seconds;
focused editors are preserved. No realtime service was added.

Migration `045_customer_simulator_and_triage.sql` adds simulator sessions and the
three classification fields. Existing escalated records get owner action; their
historical AI decisions/urgency are not invented. New urgency initially maps the
existing urgent/negative-sentiment rule to short-term and other outcomes to
long-term, with staff review. This is a minimal policy presentation, not a complete
independent model-based urgency/owner-action classifier. The existing configurable
business response target, timezone, staffed hours and reminders are reused; no SLA
duration or separate urgency scheduler was introduced. The current demo target is
unset.

Real versus mock execution is scoped to each immutable session through
AsyncLocalStorage. Real sessions override the global test/mock setting without
mutating it, require existing provider credentials and matching real embedding
provenance, and reject the mock provider. A guarded preparation command embeds
current published demo knowledge using the existing provider adapter, preserves
content/approval boundaries and records provenance. Generated answers record mode,
provider and model. Deterministic policy replies and holding acknowledgements are
not labelled as model-generated answers.

Two implementation defects found during verification were corrected: sending
during new-session creation could reach the prior thread, and human-owned backlog
messages could otherwise be answered after a later release. Creation now disables
the old composer and invalidates stale reads; ingestion records AI pause state so
release applies to future enquiries. Existing ownership checks still suppress
queued AI outbound after takeover.

## C. File changes and repository state

Entry: `main`, HEAD `34bb86e31739e32a45f04a802c0c2576516ac399`, zero staged,
six modified tracked files and two untracked Tranche 00 files. During this task,
HEAD advanced externally to `cdc3d6637a5ed87f40db35f314bb637b9a4282e4`
(`newthingsadded`). That commit includes Tranche 00 and some unfinished Tranche 01
work. No commit, staging, reset, clean, rebase or push command was executed by this
task. The verified deliverable is the current working tree, not HEAD alone.

Final inventory: **zero staged, 22 modified tracked files and 17 untracked files**,
including this report. All eight entry Tranche 00 file
hashes remain identical. `.env`, `pnpm-lock.yaml` and `next.config.ts` remain
identical too. Only `package.json` changed among the other protected entry files,
to add three demo scripts; no dependency version or lockfile changed.

Runtime: Node 24.21.0, pnpm 10.33.0, Next 16.4.0, React 19.2.4, TypeScript 5.9.3,
PostgreSQL 18.6, pgvector 0.8.0, Mailpit 1.32.0, tmux 3.7c. Architecture remains
one Next TypeScript application/API plus the separate existing PostgreSQL-backed
worker. There are now 45 migrations, all applied to the running verified local
database; no existing migration was edited.

Files below include this task's work even where the external commit already
captured an intermediate version:

| Files | Purpose |
|---|---|
| `db/migrations/045_customer_simulator_and_triage.sql` | Sessions, independent classification and legacy owner-action backfill |
| `src/app/demo/customer/page.tsx`, `src/components/customer-simulator.tsx` | Guarded customer UI and shared persisted message history |
| `src/app/api/demo/customer/route.ts`, `src/lib/customer-demo.ts` | Authenticated session ownership, bounded ingestion, idempotency, rate limits, retry and delivered state |
| `src/lib/customer-demo-boundary.ts`, `src/lib/customer-demo-ai.ts`, `src/lib/customer-demo-setup.ts` | Local database/tenant identity, real configuration checks and guarded setup/embedding preparation |
| `scripts/demo/customer-simulator.ts`, `scripts/demo/customer-worker.ts`, `package.json` | Setup, real-vector preparation and dedicated safe launcher for the existing worker |
| `src/lib/llm/execution-mode.ts`, `src/lib/env.ts`, `src/lib/llm/index.ts`, `src/lib/llm/anthropic.ts` | Per-session execution mode and prevention of silent mock fallback |
| `src/lib/agent/engine.ts`, `src/lib/knowledge/retrieve.ts` | Effective mode/model metadata, existing-policy triage persistence and real-provider retrieval filtering |
| `src/lib/channels/inbox.ts`, `src/lib/channels/inbox-worker.ts`, `src/lib/channels/dispatch.ts` | Existing-transaction ingestion, human-backlog suppression, worker mode and synthetic-only delivery boundary |
| `src/lib/conversation-actions.ts`, `src/app/api/client/conversations/[conversationId]/route.ts` | Tenant/capability-bound takeover and classification, transactional audit |
| `src/app/api/escalations/route.ts`, `src/lib/escalations-bulk.ts` | Keep new labels consistent with existing resolve/release transitions |
| `src/app/client/inbox/page.tsx`, `src/app/client/conversations/[conversationId]/page.tsx`, `src/components/conversation-classification-panel.tsx` | Extend the existing business inbox and ownership controls |
| `src/lib/reporting.ts`, `src/components/reporting-panels.tsx`, `src/components/auto-refresh.tsx` | Filters, labels and refresh without overwriting focused editors |
| `src/components/channel-conversation-thread.tsx`, `src/components/mock-ai-banner.tsx`, `src/components/shell.tsx` | Per-answer mode labels and accurate mixed-mode banner |
| `src/lib/types.ts`, `src/lib/channels/catalog.ts`, `src/lib/client-channel-drafts.ts`, `src/lib/triage-flow.ts`, `src/components/assistant-tester.tsx`, `src/components/operator/operator-panels.tsx` | Recognize the existing console enum without enabling it as a real provider |
| `src/proxy.ts` | Protect simulator page/API prefixes |
| `tests/unit/customer-demo-ai.test.ts`, `customer-demo-route.test.ts`, `customer-simulator-ui.test.tsx`, `business-conversation-route.test.ts` | Mode/configuration, API authorization and UI-state regressions |
| `tests/integration/customer-simulator.test.ts`, `tests/e2e/customer-simulator.spec.ts` | Real isolated database/worker flow and connected browser acceptance |
| `docs/demos/customer-simulator.md`, this report | Repeatable setup, credential procedure, scope and verification evidence |

Significant entry points: `src/lib/customer-demo-boundary.ts:12`,
`src/lib/customer-demo.ts:12`, `:21`, `:57`, `:89`, `:108`,
`src/lib/conversation-actions.ts:8`, `:19`,
`src/lib/customer-demo-ai.ts:30`, `src/lib/customer-demo-setup.ts:25`,
`src/lib/channels/inbox-worker.ts:82`, `:116`,
`src/lib/channels/dispatch.ts:40`, and `src/lib/agent/engine.ts:662`.

## D. Runtime evidence and access

| Service/interface | Address/details |
|---|---|
| Customer simulator | <http://localhost:3000/demo/customer> |
| Business inbox | <http://localhost:3000/client/inbox> |
| Login | <http://localhost:3000/login> |
| Health/readiness | `/api/health`, `/api/readiness` — HTTP 200 |
| Mailpit | <http://localhost:8025>; loopback SMTP 1025 |
| PostgreSQL | Loopback 55433, explicitly identified and marked `pronto_test` |
| Persistent services | tmux `pronto-local`, windows `postgres`, `mailpit`, `web`, `worker` |

Use the PS.Cafe responder account documented in
[the existing fixture guide](../demos/ps-cafe-raffles-city.md). It has conversation
response and release capabilities. An operator login is not interchangeable with
the business-owner role. Credential values are not reproduced here. Open customer
and business pages in separate tabs. Select Mock explicitly until genuine AI is
configured. The normal worker interval can add up to approximately 15 seconds.

The localhost URLs are intended for the Windows browser through WSL forwarding.
They were exercised inside WSL; Windows-side forwarding was not directly tested.
No public binding or Windows networking configuration was changed.

Actual final persistent-stack browser evidence:

| Enquiry | Database/worker result | Customer and business result |
|---|---|---|
| “What time do you close today?” | Completed inbound job, real tenant PostgreSQL RAG retrieval, mock generation, one sent synthetic outbox reply | Customer received the fixture's 10:00pm answer; owner saw AI yes, owner action no |
| Missing item/refund | Completed job, `complaint_or_refund`, escalated, one sent holding reply | Customer saw handoff; owner saw AI no, owner action required and manual-reply controls |
| New Real AI session | HTTP 503 naming `OPENAI_API_KEY` | Clear configuration failure; no mock session/answer substituted |

Preserved example threads:

- Hours: `/client/conversations/6b8dd2c2-2bb4-438c-8b9b-dede70451d51`.
- Refund: `/client/conversations/a65d3b9c-f2d6-4ee2-bcae-60aef5b42817`.

These two conversations remain in the running database. The browser walkthrough
recorded HTTP 200 for customer/business pages, 46 successful frontend asset
requests and zero page errors. Screenshots and sanitized results are under
`/tmp/pronto-tranche01/screenshots`, `browser-smoke.json` and
`runtime-evidence.json`. The worker heartbeat was fresh and its actual model
selection was `mock`. Synthetic DM delivery is visibility through PostgreSQL and
authenticated polling; it is not an Instagram delivery receipt.

The separate isolated browser suite exercised manual owner review while AI stayed
active, takeover, skipped processing while human-owned, manual reply received by
the customer, resolution, explicit release, a future AI reply and a new refund
thread. It also retained the existing local SMTP/Mailpit browser workflow.

Reconnect with `tmux attach -t pronto-local`. Web/worker logs are
`/tmp/pronto-tranche01/logs/web.log` and `worker.log`; PostgreSQL/Mailpit logs stay
under `/tmp/pronto-local/logs`. `/tmp/pronto-tranche01/start-services` starts only
missing/stopped services with the current wrappers.
`/tmp/pronto-tranche01/restart-app` gracefully reloads only web and worker.
`/tmp/pronto-local/stop-services` stops this local stack without dropping data.
Never kill unrelated sessions or system database services. These `/tmp` launch
artifacts and the existing temporary database are session-local, not boot-persistent
deployment configuration.

## E. Real AI verification

**No genuine external LLM inference occurred.** The demo's configured generation
is OpenAI `gpt-5.5` and embeddings are OpenAI `text-embedding-3-small`, but all
development provider credentials are absent. The working interactive flow uses
explicit mock generation with real tenant database retrieval. A test that stubs
the OpenAI adapter proves mode selection/error handling only; its `real` context
does not prove an external model call.

The supported variables and provider combinations are documented in
[the simulator runbook](../demos/customer-simulator.md). For the current OpenAI
configuration use `OPENAI_API_KEY`, `PRONTO_LLM_PROVIDER=openai`,
`PRONTO_EMBEDDING_PROVIDER=openai`, optionally `OPENAI_RESPONSE_MODEL` and
`PRONTO_EMBEDDING_MODEL`. Azure uses `AZURE_OPENAI_API_KEY`,
`AZURE_OPENAI_ENDPOINT`, the response deployment and embedding deployment variables.
Anthropic generation requires `ANTHROPIC_API_KEY` plus a separately configured
OpenAI/Azure embedding provider. Existing adapters and prompts are reused.

For this running stack, create a new private, owned, mode-600 file at
`/tmp/pronto-tranche01/real-ai.env` using a local editor; do not overwrite an
existing file. Set the provider variables there with `export` and add
`export PRONTO_DEMO_REAL_AI_APPROVED=1`. Enter keys only locally. The private
`app-run` launcher loads this optional file after the original sanitized runtime
environment; no such file or key was created by this task.

Then run `/tmp/pronto-tranche01/app-run pnpm demo:customer:embed`, followed by
`/tmp/pronto-tranche01/restart-app`. The explicit opt-in permits chargeable
embedding calls. This launcher removes the test-only socket guard only when the
private real-AI opt-in exists, keeps external channel delivery blocked, and forces
both Chope live-read flags off. Test commands retain their guard and mock mode.
Create a new Real AI session and verify a substantive RAG question, a successful
provider generation event and delivered answer before claiming genuine acceptance.
Do not use a greeting, booking invitation or holding acknowledgement as proof.

## F. Security verification

- Both simulator page/API require a real application session, explicit development
  opt-in, the marked loopback test database and the fixed demo tenant identity.
  Production mode rejects the simulator. It currently requires a native loopback
  server address; Docker-bridge simulator acceptance was not established.
- Database identity is checked using URL agreement, database name, server address
  and the existing database comment marker. Port numbers alone are never trusted.
- Simulator histories and retries require the initiating user's ID as well as
  tenant/conversation/channel scope. Deleted users and other tenants are rejected.
- Business actions require the client role and existing `conversation.respond`;
  release retains existing `conversation.release`. The new endpoint derives tenant
  from the authenticated actor, rejects operator-role access, validates action/
  urgency and uses a fixed redirect. It cannot inherit implicit operator privilege.
- Mutations use existing same-origin checks. Message requests are bounded, message
  IDs are idempotent, and database-locked limits enforce 20 sessions/hour,
  10 messages/minute and five stopped-job retries/hour per actor.
- Session creation, classifications, takeover and vector preparation have audit
  records; sensitive transitions use existing transactional services. This does
  not add or claim a complete AI decision/audit ledger.
- Queued AI answers remain ownership-gated at delivery, and human-owned backlog
  is skipped after release. Synthetic delivery calls no Meta adapter. A negative
  test proves even an active fixture Meta channel cannot send under the sandbox
  delivery flag. Real PS.Cafe Meta channels remain draft.
- Approval/publication, onboarding, permissions, staff notifications and operator
  administrative services remain. No credentials, unrestricted prompts, real
  customer messages or production resources were used.

These checks support the tested local boundaries; they do not establish complete
security, regulatory compliance or live-provider readiness.

## G. Testing

Final ordinary suite: **329 passed, 89 skipped, zero failed** across 90 files.
Final database-inclusive suite: **410 passed, eight skipped, zero failed**.
Final local-mail browser suite: **17 passed, zero skipped/failed**. Lint,
typecheck and guarded build pass.

Actual command forms and evidence:

| Command | Result |
|---|---|
| `pnpm test` | 329 passed, 89 skipped; `logs/unit-final.log` |
| `/tmp/pronto-tranche00/test-run pnpm test:db` | 410 passed, eight skipped; `logs/db-final.log` |
| `/tmp/pronto-tranche00/test-run pnpm test:local-mail` | 8 passed; `logs/local-mail-final.log` |
| `/tmp/pronto-tranche00/test-run env PRONTO_RUN_DB_TESTS=1 pnpm exec vitest run tests/integration/customer-simulator.test.ts tests/unit/customer-demo-ai.test.ts` | 13 passed, including nine new DB scenarios and a stubbed-provider failure/handoff case |
| `pnpm typecheck` | PASS; `logs/typecheck-last.log` |
| `pnpm lint` | PASS; `logs/lint-last.log` |
| `PRONTO_TRANCHE_WORKDIR=/var/tmp/pronto-tranche01-app /tmp/pronto-tranche00/test-run env NODE_OPTIONS=--import=./tests/setup/network-guard.mjs PRONTO_TEST_ALLOW_BUILD_IPC=1 pnpm build` | PASS; `logs/build-final.log` |
| Guarded Playwright command below | 17 passed; `logs/e2e-complete.log` |
| `TMPDIR=/var/tmp node /tmp/pronto-tranche01/browser-smoke.cjs` | Actual running-stack hours/refund/missing-key flow passed |
| `/tmp/pronto-local/run pnpm migrate:test` then `/tmp/pronto-local/run env PRONTO_CUSTOMER_DEMO_ENABLED=1 pnpm demo:customer:setup` | Additive 045 and simulator setup on the existing verified local demo; no reset/seed |
| `git diff --check` | PASS |

Playwright invocation:

```sh
PRONTO_TRANCHE_WORKDIR=/var/tmp/pronto-tranche01-app \
/tmp/pronto-tranche00/test-run env \
  APP_BASE_URL=http://localhost:3001 PLAYWRIGHT_BASE_URL=http://localhost:3001 \
  PRONTO_TEST_LOCAL_MAIL=1 PRONTO_LOCAL_EMAIL_ENABLED=1 \
  PRONTO_LOCAL_STAFF_COMMANDS=1 PRONTO_LOCAL_STAFF_E2E=1 \
  PRONTO_CUSTOMER_DEMO_ENABLED=1 PRONTO_DEMO_ONLY_DELIVERY=1 \
  PRONTO_TEST_ALLOW_BUILD_IPC=0 \
  NODE_OPTIONS=--import=./tests/setup/network-guard.mjs \
  pnpm exec playwright test --workers=1
```

The private test wrapper supplies sanitized, matching database URLs for a separate
previously owned isolated cluster on 55434, with verified database/server/marker
identity and test-only auth/encryption. No regression fixture resets ran on the
persistent demo at 55433. Mail tests send only to loopback Mailpit. Provider calls
are blocked or explicitly stubbed. Browser test server and worker are owned by
the test run, use 3001/55434 and are stopped afterward; 3000 is preserved.
The owned 55434 test cluster was also stopped after final identity verification.
To rerun these commands in this session, restart it with
`pg_ctl -D /tmp/pronto-tranche00/pgdata -l /tmp/pronto-tranche01/logs/test-postgres.log -w start`,
then run `/tmp/pronto-tranche00/test-run pnpm test:db:verify` before any tests.

The source copy adapts only the test-server port, smoke-test local allowlist and
socket-guard web port. No tracked startup configuration was overwritten. Guarded
builds use that copy to avoid corrupting the live `.next` tree.

Earlier attempts exposed and fixed test-only CSRF host/locator/navigation issues.
An intermediate rerun was interrupted after the constrained `/tmp` filesystem
filled with test build caches. Owned test copies were moved to disk-backed
`/var/tmp`, a stale live development cache was regenerated after graceful web
shutdown, and final browser/build checks passed. PostgreSQL and Mailpit remained
running; no database reset was used as recovery. Next still reports slow
filesystem warnings. Historical Tranche 00 counts are not substituted for these
runs, and coverage was not remeasured. Compared with Tranche 00, 17 new unit/UI/API
tests and nine new DB tests explain ordinary passes increasing from 312 to 329,
ordinary skips from 80 to 89, and DB-inclusive passes from 384 to 410. Three new
opt-in browser scenarios increase local-mail Playwright acceptance from 14 to 17.
The eight DB-inclusive skips are the separately run local-mail tests.

## H. Outstanding limitations

1. **Acceptance blocker — credentials/provider:** Configure a permitted development
   LLM account and real embeddings, then observe a genuine grounded response in
   this UI/worker path. No claim of real-AI or account/model entitlement is made.
2. **Later protected-demo work:** Simulator intentionally requires development mode
   and a marked local database. Hosted authentication/access and production-safe
   synthetic-channel enablement belong to PRON-88, not an environment-flag bypass.
3. **Triage scope:** Separate labels and authorized review work, but automated
   urgency remains an existing-rule mapping. Independent semantic owner-action
   classification and separate urgency targets/scheduling are not claimed as
   completed PRON-7 work. No daily/weekly recaps were added.
4. **Existing UI consistency:** Legacy escalation `customer_handoff_status` can
   still show pending even after the durable synthetic holding reply is sent.
   Customer history and this report use actual `outbound_messages.status='sent'`.
   The legacy diagnostic badge should be reconciled with durable evidence later.
5. **Provider/administrative dependencies:** Genuine Instagram authorization and
   DM receipt/reply remain PRON-40/59/60; the simulator provides no acceptance for
   them. Chope exact links remain at Gabriel's decision gate. No new reads or
   fallback behavior were implemented. Eatigo/Oddle and recaps remain later work.
6. **Concurrent Git activity:** An external commit captured intermediate work.
   Preserve and review the complete current worktree before choosing a future
   release snapshot; this task neither creates nor repairs commits.

## I. PRON-87 readiness

The operator frontend remains. Later deletion candidates are the 19 page modules
under `src/app/operator/` (overview, businesses, tenant setup/detail subpages,
conversations/escalations, knowledge/connections and operations),
`src/components/operator/operator-nav.tsx`, operator-only sections of
`operator-panels.tsx`, and `src/components/operator-sidebar-actions.tsx`.
Inventory their imports before deletion.

`src/components/shell.tsx` contains both business and operator navigation and must
be split carefully. Business pages reuse `assistant-tester.tsx`, reporting panels,
conversation review/thread/triage panels, knowledge-source panels, badges, refresh
and authentication. Names such as `OperatorBrandVoicePanel` are insufficient proof
that a module can be deleted safely.

Keep all 26 administrative route modules under `src/app/api/operator/`, subject to
an explicit later service/API inventory, including onboarding, permissions,
knowledge approval/publication, channel activation, integrations, offboarding and
job/notification retries. Preserve shared auth/staff permissions, managed
approvals, audit, worker operations and database services. Existing operator UI
browser regression tests still pass. No operator frontend/backend was removed.

## J. ChatGPT handover

Pronto remains an existing Next 16.4 / React 19.2 TypeScript modular monolith with
PostgreSQL/pgvector and a separate durable inbox/outbox worker. Tranche 01 extends
that architecture rather than adding a second backend or realtime service.

PRON-86 now has a functional local Instagram-inspired customer page at
`http://localhost:3000/demo/customer` and the connected business inbox at
`http://localhost:3000/client/inbox`. Both use persisted tenant conversations and
existing authentication. The unofficial PS.Cafe Raffles City demo uses a strictly
synthetic console transport, never its real Instagram account. Customer messages
enter the real durable queue; customer replies appear only after durable outbound
delivery. Business staff can review independent AI/owner labels, urgency, take
over, manually reply/resolve and explicitly release. Human-owned messages remain
unanswered by AI even if release precedes queue processing; future enquiries can
resume AI. Pending, resolved and AI-handled filters and polling are implemented.

Real AI is implemented as a per-session execution mode using existing OpenAI,
Azure or Anthropic generation adapters and OpenAI/Azure embeddings. It never
silently falls back to mock and excludes unmarked deterministic seed vectors.
There is a guarded real-vector preparation command. **Actual external inference
is still unverified/blocked because development keys are absent.** The visible
successful hours answer used explicit mock generation with real database RAG;
the refund used existing deterministic policy escalation. A stubbed provider test
is not genuine inference evidence. Current configured models are OpenAI gpt-5.5
and text-embedding-3-small; those settings do not prove account access.

Migration 045 adds actor-owned simulator sessions and AI-response/owner-action/
urgency fields. Minimal urgency presentation reuses existing rules; broader
semantic triage and per-urgency scheduling are not completed. Existing response
target/timezone/staffed-hours/notification controls remain; the demo target is
unset. No arbitrary SLA or recap system was introduced.

The local tmux stack stays running on web 3000, marked database 55433 and Mailpit
8025/1025. New web/worker launchers and logs are under `/tmp/pronto-tranche01`;
use its `restart-app` or `start-services`. The optional private `real-ai.env`
procedure and real embedding command are documented in this report/runbook.
Windows localhost forwarding is expected but was tested only from WSL.

Tranche 00's eight files are byte-preserved, and Chope behavior is unchanged.
There was no new Chope read, deep-link builder, unsupported fallback, real Meta
send, Jira/Confluence update, deployment or operator removal. The exact-link
decision gate remains. PRON-87 needs shared-shell/component separation before
deleting operator pages while preserving administrative APIs and permissions.

Final tests: ordinary 329 passed/89 skipped; DB-inclusive 410 passed/eight skipped;
local mail eight passed; connected Playwright 17 passed; lint, typecheck and guarded
build passed. Ordinary tests, isolated DB tests, local Mailpit, guarded build and
connected Playwright acceptance are separate from
genuine LLM/provider acceptance. The immediate next step is secure real-provider
configuration and one actual grounded customer/owner demonstration, followed by
the scoped operator dependency cleanup and protected hosted-demo tranche. Do not
advance live Instagram/booking or production-readiness claims from local fixtures.

Entry HEAD was 34bb86e; HEAD advanced externally to cdc3d66 during work and captured
some intermediate changes. The working tree, including remaining unstaged/new
files, is the tested deliverable. No Git history operation was performed by this
task; environment, lockfile and all prior Chope changes were preserved.
