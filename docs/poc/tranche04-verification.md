> Current POC direction changed to Groq-only generation with local PostgreSQL
> text retrieval. See [the Groq-only verification](groq-only-verification.md).
> This dual-provider tranche report remains historical evidence.

# Tranche 04 — dual free-tier providers and Vercel demo preparation

Evidence collected 25–26 October 2026 against the actual uncommitted worktree.
No commits, pushes, resets, deployments, paid-plan activations, Jira/Confluence
updates, Meta sends, live Chope reads or reservation operations were performed.

## Executive verdict — PARTIAL

Gemini and Groq generation adapters, Gemini Embedding 2 retrieval, immutable
conversation model selection and protected hosted-demo preparation are implemented.
OpenAI, Azure, Anthropic and deterministic Mock remain supported. Actual external
inference is **BLOCKED by absent credentials, account verification and explicit
testing opt-in**. A stubbed provider response is not genuine acceptance. The
account consoles were not available: account model access, quotas, billing and
zero billed usage cannot be certified.

Final checks: **454 unit passes/101 skips, 547 DB-inclusive passes/8 skips,
eight local-mail passes, 27 browser passes; lint, typecheck and guarded build pass.**
The ordinary local stack is preserved. The protected production profile is tested
using a separate owned local TLS/PostgreSQL fixture; this does not establish a
working Vercel deployment, cloud recovery or provider acceptance.

## Actual repository and environment

| Item | Evidence |
|---|---|
| Branch / HEAD at entry and final review | `main`, `b1b43cdbfde28ef49fda9bf3c652ce49fd5c5d33` |
| Initial worktree | Clean: zero staged, modified and untracked files; earlier tranche work was already committed by another process before this task |
| Current worktree | 0 staged; 60 modified tracked; 19 untracked files, all Tranche 04 work; no Git history changes |
| Toolchain | Node 24.21.0, pnpm 10.33.0, Next 16.4.0, React 19.2.4, TypeScript 5.9.3 |
| Instructions | Repository AGENTS.md and installed Next self-hosting guidance read; prior tranche reports treated as historical evidence |
| Database | PostgreSQL 18.6, pgvector 0.8.0; additive migrations 046/047 now follow existing 001–045 |
| Main persistent local demo | Loopback 55433, marked `pronto_test`; preserved, never seeded/reset for regression tests |
| Regression DB | Separately owned loopback 55434; identity verified before migration/tests, never inferred disposable from its port |
| Protected-profile fixture | Newly created local cluster/database on 55435, separate TLS/identity, synthetic random-password accounts, no provider keys |
| Concurrent work | No overlapping repository writer observed; unrelated system builds were left intact |

Migration 046 adds conversation profile metadata and a separate Gemini vector
table/index, retaining all original vectors. Migration 047 adds persistent hashed
login-throttle buckets. They were applied to identified local demo/test databases
using their documented safeguards; no production/shared database was touched.

## Provider/model capability matrix

| Capability | Classification | Evidence / limit |
|---|---|---|
| Gemini `gemini-3.8-flash` | Implemented and code/test verified | Default new-conversation choice; published Standard free offering; actual account access/inference unverified |
| Groq `openai/gpt-oss-20b` | Implemented and code/test verified | Fixed OpenAI-compatible endpoint, strict structured output; account Free entitlement/limits unverified |
| Gemini `gemini-3.5-flash-lite` | Implemented and code/test verified | Optional allowlisted choice using the same adapter; published free offering; account acceptance unverified |
| Gemini `gemini-embedding-2` | Implemented and code/test verified | Standard text free offering, 1536-dimensional separate QA index; no real vectors generated without approval/key |
| OpenAI / Azure / Anthropic | Preserved, regression tested with existing test doubles | Existing adapters and configured-real choice remain; no external calls in this tranche |
| Mock | Runtime verified locally | Explicit selection; independent of real keys, opt-in and embedding readiness |
| Provider quota / timeout / auth errors | Code/test verified | Sanitized cause category/status; no SDK retry, model/provider change or implicit Mock |
| Real Gemini + Groq answers in both UIs | Externally blocked | Both development keys and explicit approval absent |
| Account free billing / user-region eligibility | Unverified | Requires owner review in provider consoles; app flags cannot inspect billing |
| Vercel/managed DB/provider integration | Prepared, not deployed | Local production-profile exercise is narrower evidence |

Official sources: [Google pricing](https://ai.google.dev/gemini-api/docs/pricing),
[Google OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai),
[Google embedding guide](https://ai.google.dev/gemini-api/docs/embeddings),
[Groq models](https://console.groq.com/docs/models),
[Groq structured outputs](https://console.groq.com/docs/structured-outputs).

Google publishes free Standard input/output for the requested generation models
and text embeddings. Enabling paid billing is not a requirement for its published
Free tier, but a key on a paid account does not become free merely because this
application calls a free-eligible model. Groq documents a Free plan and a paid
Developer upgrade; its public model table also contains paid prices/Developer
limits. No universal numeric free quota is assumed. Actual project limits and
model permissions must be checked in Google AI Studio and Groq Console before
setting the attestation flags. See [Google billing](https://ai.google.dev/gemini-api/docs/billing),
[Google limits](https://ai.google.dev/gemini-api/docs/rate-limits),
[Groq billing](https://console.groq.com/docs/billing-faqs),
[Groq limits](https://console.groq.com/docs/rate-limits).

Google unpaid processing may use content for improvement/human review; do not send
personal, confidential or sensitive information. Its terms require Paid Services
for API clients available to EEA/UK/Swiss users: verify intended invited-user
regions rather than assuming Singapore hosting resolves this. Groq retains usage
metadata and has reliability/abuse content-retention exceptions up to 30 days;
account Data Controls/ZDR were not inspected. The POC must use public outlet facts
and synthetic messages only. These findings do not certify legal compliance.
[Google terms](https://ai.google.dev/gemini-api/terms),
[Groq data policy](https://console.groq.com/docs/your-data).

## Generation, embeddings and provenance

`src/lib/llm/free-providers.ts:32` extends the existing `LlmProvider` abstraction
using the installed OpenAI SDK's Chat Completions interface. The existing OpenAI
Responses adapter remains unchanged. Endpoints are fixed to Google's v1beta
OpenAI-compatible API and Groq's v1 API. The browser submits only an allowlisted
choice, never a model ID, URL or key.

New adapters require the exact synthetic tenant, a scoped execution profile,
server-side key, `PRONTO_DEMO_REAL_AI_APPROVED=1`, and the respective
`PRONTO_GEMINI_FREE_TIER_CONFIRMED=1` / `PRONTO_GROQ_FREE_TIER_CONFIRMED=1`.
These gates prevent accidental activation; they are not account billing evidence.
Response-model overrides cannot rewrite an existing conversation snapshot.

Generation defaults to 25 seconds, bounded output, SDK retries disabled and strict
JSON-schema decision output with runtime validation. Missing citations trigger
human fallback. The provider-returned model must match the requested allowlisted
model. HTTP status and quota/auth/timeout/invalid-response categories survive
normalization; private provider payloads, keys and unrestricted prompts do not.
There is no automatic paid upgrade, alternative model or Mock substitution.

`src/lib/llm/free-providers.ts:67` uses individual native `embedContent` requests,
not paid Batch. Gemini Embedding 2 supports the schema's 1536 dimensions. It does
not accept Embedding 1's `task_type`; this implementation uses documented QA query
and document text prefixes, the same model/dimension/profile on both sides.
Groq generation shares these Gemini vectors and therefore needs a Gemini key too.

`db/migrations/046_demo_provider_profiles.sql:14` creates a separate HNSW cosine
index with provider/model/profile, content hash, prepared timestamp and composite
tenant/chunk FK. Original Mock/OpenAI vectors are not overwritten. Current content
hash, tenant, model and archive filters apply during hybrid retrieval
(`src/lib/knowledge/retrieve.ts:22`). Preparation collects vectors before its
transaction and refuses changed/archived sources. The existing published-chunk
and approval mechanism remains authoritative; no new approval bypass is added.

Session creation and audit event are transactional. Per-message provider/model,
actual generation mode, provider response ID and returned usage are recorded
through the existing agent message/usage path (`src/lib/agent/engine.ts:555`).
Selected model and actual generation are distinguished: deterministic policy/
booking replies or human replies do not become proof of external generation.
Existing traces/usage records are not a newly certified complete decision ledger.
Dollar estimates still use the existing generic cost-label rates, not provider
account invoices or verified free-tier billing; returned tokens/IDs and estimated
cost must not be conflated.

## UI, authorization and local runtime evidence

`/demo/customer` now defaults to Gemini Flash and offers Groq, Lite, Mock and the
legacy configured-real choice. New conversations persist a validated immutable
profile. Both customer bubbles and business conversation history show actual
provider/model/mode; inbox rows show the last generated model or pending selection.
Quota failures explain that selecting another provider requires an intentional new
conversation. Human ownership, explicit release and durable ingestion/outbox are
preserved. Model display tests with stubbed inference are explicitly synthetic.

The main environment contains no Gemini/Groq/OpenAI development key, no real-AI
approval and zero Gemini vectors. Missing-key creation returns an actionable 503;
Mock continues independently. No free-provider endpoint was called by this task.
No claim is made about an account's invoice or billed usage.

Main application browser round trip passed: conversation
`e283ac40-38f0-4b65-9878-cee9865b3ecf` received a durable Mock RAG reply, appeared
in the fully rendered business inbox with `mock / mock` attribution, was taken
over, received a persisted human reply visible to the customer, and was released.
Account switching, refresh and shared-tab logout also passed. All 308 requested
frontend assets succeeded. The four retired operator destinations returned 404;
operator business mutation returned 403; expired-tab API returned 401. Health and
readiness returned 200 with a fresh worker heartbeat. Each new free-model create
attempt returned an explicit missing-key/approval 503, without creating a Mock
substitute.

One development browser exception occurred during that successful walkthrough:
`Performance.measure: ClientInboxPage cannot have a negative time stamp`. No
application performance marks/measures were found in `src`; its precise framework
cause remains unverified. The UI and complete flow rendered successfully. The
production-profile HTTPS walkthrough had zero browser errors. This isolated dev
instrumentation observation is recorded rather than attributed to Windows, auth
or a database hang. Screenshots under `/tmp/pronto-tranche04/screenshots/` were
visually inspected; they show actual inbox content and the delivered human reply.

The separate local production/TLS fixture also passed its full Mock round trip,
secure + HttpOnly + SameSite=Lax session cookie checks, anonymous API 401,
operator UI 404, business mutation 403, login/inspect/logout CLI over HTTPS,
readiness 200 and login throttle 429. Its synthetic conversation was
`7d9f734d-9c06-476a-bf5c-db3433795798`. Wrong identity, repeated bootstrap and
attempted disposable-test verification were rejected. Real preflight rejected
missing keys as expected. These are local production-profile tests, not cloud or
external-inference acceptance.

Local access remains:

- Customer: <http://localhost:3000/demo/customer>.
- Business: <http://localhost:3000/client/inbox>.
- Sign-in: `/login`, responder `responder@ps-cafe-demo.test`; use the existing
  private/local [fixture guide](../demos/ps-cafe-raffles-city.md) for setup.
- Mailpit: <http://localhost:8025>; health `/api/health`, readiness `/api/readiness`.
- `tmux attach -t pronto-local`; windows `postgres`, `mailpit`, `web`, `worker`.
- Logs: `/tmp/pronto-tranche01/logs/web.log`, `worker.log`; verification artifacts
  `/tmp/pronto-tranche04/`. No passwords, keys or session cookies appear here.

Web/worker were gracefully restarted with their existing wrappers; PostgreSQL and
Mailpit remained running. `/tmp/pronto-tranche01/restart-app` repeats that safe
restart. `/tmp/pronto-local/start-services` preserves healthy local services.
To stop the owned stack later, use its existing `/tmp/pronto-local/stop-services`;
it was not run at completion. Temporary wrappers are session artifacts, not a
permanent installation. Both owned verification clusters (55434/55435) and
verification web/worker processes were stopped after testing; main services were
left running. Windows Chrome/WSL forwarding were not independently
driven; browser automation runs in WSL against localhost.

For real acceptance, privately configure the two keys plus approval/free-tier
attestations in the owned mode-600 file described in
[customer-simulator.md](../demos/customer-simulator.md). Prepare only current
synthetic knowledge with `demo:customer:embed --provider gemini`, restart both
processes, then ask the same substantive knowledge enquiry in independent Gemini
and Groq conversations. Require actual model response IDs/token usage, cited tenant
knowledge, delivered `real` metadata and the same response in both UIs. Do not use
a deterministic booking question as the inference acceptance test.

## Vercel readiness and regression fixes

The [concrete deployment runbook](../setup/vercel-demo.md) and
`deploy/protected-demo.env.example` describe the proposed Vercel web, persistent
Render worker and managed pgvector arrangement. `vercel.json` and Docker
`worker-demo`/`migration` targets are prepared. No Vercel Function runs the worker
loop. No cloud image build, Vercel runtime, managed backup or restore is certified.

The protected-demo profile requires a separate exact database marker, strong
secrets, TLS/HTTPS, invited identities, synthetic-only console transport and both
Chope flags off. Ordinary production and disposable-test safeguards remain
separate. Bootstrap refuses populated data and creates no external integration.
PostgreSQL login throttling works across serverless instances. Vercel connection
pools have bounded size and `attachDatabasePool` cleanup. Migration transactions
now use one checked-out connection with an advisory migration lock; migrations use
the direct endpoint rather than a transaction pooler.

The local TLS production exercise found that internal `request.url` could cause
303 redirects to the private server port. CSP `form-action 'self'` correctly
blocked those redirects. A shared `src/lib/http/redirect.ts` helper now pins
production internal application redirects to configured public HTTPS, rejecting
foreign destinations. Internal client/auth form redirects reuse it; OAuth's
external authorization destination is unchanged. CSP, cookies, tenant checks and
roles are retained. A second delivery review found direct staff SMTP bypassing
generic dispatch; protected-demo staff notifications now skip before transport
selection, with a regression test.

Administrative APIs and CLI remain protected. Optional origin-pinned Vercel
automation headers are supported in the private CLI environment, independently of
Pronto operator authentication. The actual platform gate still requires cloud
acceptance. No operator frontend is restored or business role elevated.

Plan approximately $46–48/month for Vercel Pro, a $7 persistent worker and a paid
small managed database, before tax/AI/overages. A $27 configuration using Neon Free
is conditional on limited awake hours: continuous worker polling can exceed its
100 CU-hour allowance. If fixed Vercel egress is required for database IP controls,
the $100/month Static IP add-on raises the Render-DB example to roughly $147–148
plus transfer. Do not activate these without budget/network approval. Hobby's
personal non-commercial restriction makes it inappropriate to assume eligibility
for Pronto. Current pricing links/calculations are in the deployment runbook.

## Testing and safety

| Command actually executed | Result |
|---|---|
| `/tmp/pronto-tranche00/test-run pnpm test --maxWorkers=2` | **454 passed, 101 skipped, 0 failed**; 555 tests, 85 passing/16 skipped files |
| `/tmp/pronto-tranche00/test-run pnpm test:db` | **547 passed, 8 skipped, 0 failed**; 555 tests, 100 passing/1 skipped files |
| `/tmp/pronto-tranche00/test-run pnpm test:local-mail` | **8 passed**, actual loopback SMTP/Mailpit; separately opted in |
| `/tmp/pronto-tranche04/e2e` | **27 passed, 0 skipped, 0 failed**, one clean 3.5-minute invocation; isolated copy, one worker, port 3001 |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| Guarded production `pnpm build` in the isolated source copy | PASS, optimized build and 63 generated pages |
| Main-stack `/tmp/pronto-tranche01/app-run node /tmp/pronto-tranche04/runtime.cjs` | PASS Mock/human workflow; one dev performance-measure observation recorded above |
| `/tmp/pronto-tranche04/hosted-run node /tmp/pronto-tranche04/hosted-runtime.cjs` | PASS local TLS production-profile walkthrough; no external AI |
| Protected `verify`, `bootstrap`, negative identity/bootstrap/test-verifier/preflight checks | Expected success/rejection in all five guard checks |
| `git diff --check` | PASS |

The build command was:

```sh
PRONTO_TRANCHE_WORKDIR=/var/tmp/pronto-tranche04-app \
  /tmp/pronto-tranche00/test-run env APP_BASE_URL=http://localhost:3001 \
  PRONTO_TEST_ALLOW_BUILD_IPC=1 \
  NODE_OPTIONS=--import=./tests/setup/network-guard.mjs pnpm build
```

The existing owned test wrapper supplies verified DB identity, clean deterministic
credentials and a network guard. Source/scripts/migrations were byte-compared with
the isolated copy; only the shadow Playwright server port and matching test/guard
port references differ. The live main development `.next` was not used for the
production build or regression server. Build IPC permission permits loopback IPC,
not external provider/cloud sockets.

Compared with Tranche 03's 502 tests (409 unit passes/93 skips; 494 DB passes/8
skips), this work adds 53 tests: 45 ordinary and eight DB-only cases. The new
browser allowlist/profile scenario increases the browser inventory from 26 to 27.
The DB suite's eight skips are the separately opted-in local-mail tests, which
passed in their own invocation. No historical count is presented as a rerun. All regression tests use
the separately identity-verified disposable DB. The persistent 55433 demo receives
only additive migrations and bounded synthetic browser interactions, never seeds,
resets, destructive suites or test fixtures. Network guards reject provider/cloud
sockets during deterministic tests. Main-stack real mode is unconfigured.

An intermediate over-parallelized run encountered a five-second test timeout and
three fork-start timeouts under host resource pressure; a database run that
straddled the staff guard edit mixed old service imports with the new test and was
restarted against frozen source; two preliminary browser runs were interrupted
while coordinating the disposable DB and synchronizing shadow-only port references;
a cold main-browser
navigation also timed out. Their logs are retained. Final unit execution limits
workers, and browser acceptance is repeated after build completion. These attempts
are not reported as passing acceptance. Earlier development failures included a
Mock JSON-null database constraint, timeout classification, JSX lint and stale
shadow-test imports; all were corrected or the isolated copy synchronized before
the final verification. No application security control was relaxed for tests.

## Changed files and purpose

- Generation: `src/lib/llm/{demo-models,free-providers,execution-mode,index,catalog,
  credentials,errors,types}.ts`, `src/lib/agent/engine.ts` — provider integration,
  bounded calls, immutable execution profiles, sanitized errors and attribution.
- RAG/session persistence: migrations 046/047; `customer-demo{,-ai,-boundary,-setup}.ts`,
  `knowledge/retrieve.ts`, `channels/inbox-worker.ts`, simulator API and embedding
  CLI — separate vector provenance, validated snapshots, safe local/hosted identity.
- Presentation: customer simulator, channel thread, reporting panels/service and
  client conversation page — selected versus actual model/mode in both views.
- Hosted safety: `deployment-profile.ts`, `deployment-access.ts`, `login-throttle.ts`,
  `http/redirect.ts`, `db.ts`, auth/readiness routes, internal client form redirects,
  `channels/dispatch.ts`, `escalations.ts`, `scripts/admin.ts`, `scripts/migrate.ts`,
  `scripts/worker.ts`, `scripts/demo/protected-{demo,worker}.ts`.
- Packaging: `.env.example` (template only), `Dockerfile`, `vercel.json`,
  `deploy/protected-demo.env.example`, `package.json`, `pnpm-lock.yaml`; the only new
  runtime package is `@vercel/functions`. Existing `.env`/private files preserved.
- Tests: new `free-providers`, `protected-demo`, `serverless-pool`, `deployment-access`
  unit suites, `integration/free-provider-demo.test.ts`; existing auth-navigation,
  escalation, simulator configuration/API/UI and browser scenarios extended.
- Docs: this report, Vercel runbook, simulator guide, CLI platform-access note and
  a pointer from the historical hosted plan to current preparation.

## Remaining blockers and recommended next step

1. **Account/acceptance:** Gabriel privately verifies each free account, user-region
   eligibility and processing terms, supplies server-side keys locally and opts
   into the bounded synthetic tests. No keys should be sent through chat.
2. **Engineering acceptance:** prepare Gemini vectors, execute two substantive
   external enquiries and verify provider-returned evidence in both interfaces.
   PRON-86 should remain open for this specific real-AI gate; mock/stub acceptance
   does not close it. Exact account quotas are still unknown.
3. **Hosting decision:** approve Pro eligibility/budget, managed DB/network policy,
   invitations/platform protection, secret ownership and recovery retention.
   PRON-88 is prepared locally, not deployed or accepted. Its next step is review
   of the concrete runbook/configuration before any paid resource is created.
4. **Cloud acceptance after approval:** validate Vercel pool/runtime limits,
   persistent worker restart, real protected CLI access, managed backups/restore,
   and the complete hosted browser/real-provider test. No provider or cloud
   reliability claim follows from local tests.

## Self-contained ChatGPT handover

Pronto remains one Next.js 16.4/React 19 TypeScript application with PostgreSQL/
pgvector and a separate durable inbound/outbound Node worker. Its authenticated
simulated Instagram channel and business portal share persisted conversations;
human takeover, manual reply and explicit AI release use existing authorized
services. The operator frontend remains removed, while protected administrative
APIs/CLI survive. There are no real Meta sends or newly authorized Chope reads.

Tranche 04 adds server-allowlisted Gemini 3.8 Flash (default), Groq GPT-OSS 20B and
Gemini 3.5 Flash-Lite, retaining configured OpenAI/Azure/Anthropic and explicit
Mock. New sessions snapshot generation and embedding configuration; worker scope
prevents global overrides changing a chosen provider. The new free adapters are
restricted to the synthetic PS.Cafe tenant and require keys, explicit approval
and account free-tier attestations. They do not silently upgrade, retry through
another provider or substitute Mock.

All new real choices share Gemini Embedding 2 QA vectors at 1536 dimensions in a
separate, hash/version-sensitive tenant-scoped index. Existing vectors/content/
approval history are preserved. Both UIs distinguish selected model from actual
per-message provider/model/mode. Provider IDs/usage are retained when supplied.
This is implementation/test evidence, not proof of a complete audit ledger.

Final local verification passed: 454 unit tests, 547 database-inclusive tests,
eight local-mail tests and all 27 browser scenarios; lint, typecheck and guarded
build passed. Final HTTP checks returned 200 for sign-in, health, readiness and Mailpit; the
worker heartbeat was fresh, pending/processing inbound jobs were zero, and no
provider key or real-AI opt-in was present in either running application process.
Main local web/worker/Postgres/Mailpit remain available; separate
verification services were stopped.

No genuine external generation or embedding preparation has occurred because
development keys and opt-in are absent. Account Free entitlement, regional terms,
actual quotas and invoices are unverified. Google unpaid privacy terms limit this
POC to public/synthetic content; real customer data needs a separate decision.
Groq still needs Gemini for this retrieval index. Real-AI PRON-86 acceptance remains
open until both providers independently answer a substantive grounded enquiry and
the delivered response appears in customer/business views with provider evidence.

Vercel web + persistent worker + managed database preparation now exists with a
separate protected-demo identity, TLS, invited accounts, persistent login limits,
bounded Vercel DB pools, safe bootstrap/migrations, synthetic-only delivery and
private authenticated CLI platform headers. Ordinary production remains closed to
the simulator. Internal proxy redirects and a staff-SMTP bypass were fixed without
weakening CSP or permissions. Local TLS acceptance does not establish cloud
deployment. Budget roughly $46–48/month before overages, potentially $100 more for
fixed Vercel egress; a $27 Free-DB option is limited-hours conditional. Hosting and
budget approval are still required. Prioritize real-provider acceptance, then the
reviewed protected deployment; no optional integration rewrite is needed first.
