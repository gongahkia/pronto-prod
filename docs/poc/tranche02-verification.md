# Tranche 02 — business inbox recovery and operator frontend retirement

Date: 25 October 2026 (Asia/Singapore). Evidence is from the current repository
and local application, not Jira completion states. No Jira/Confluence updates,
commits, staging, deployment, real Meta sends, Chope requests or bookings occurred.

## Executive result

**Local implementation: PASS, subject to the final verification results below.**
The connected mock-mode customer/business workflow is operational. Operator
administration has an authenticated CLI/API replacement; the obsolete HQ pages
were removed after essential CLI acceptance passed. Genuine external LLM
acceptance and Windows-side browser acceptance remain separate, unverified gates.

## Repository and preservation

- Entry branch: `main`; HEAD: `2e9ea8aec9cb14e1436398c331c8f690d6bdb055`.
- Entry worktree: clean, with zero staged, modified or untracked files. Earlier
  reports of a heavily modified worktree were historical; their code was present
  in this HEAD. No concurrent editor of this checkout was observed.
- Runtime: Node 24.21.0, pnpm 10.33.0, Next.js 16.4.0, React 19.2.4, TypeScript 5.9.3.
- Migration inventory still ends at `045_customer_simulator_and_triage.sql`.
  No migrations, schema changes, dependency installation or lockfile changes
  were required. Existing environment files were not overwritten.
- Existing Chope integration/experimental links, agent engine and migration
  history were preserved. The existing modular monolith, pgvector retrieval,
  inbox/outbox and separate worker remain the implementation boundaries.
- Final worktree counts: **PENDING**. All changes are unstaged and intentional.

## Business Inbox Navigation and Loading Investigation

### 1. Redirect root cause — confirmed in code and browser

The button was already correct: `src/components/customer-simulator.tsx` links to
`/client/inbox`. At the entry HEAD, `requireUser("client")` redirected an operator
to `/login`, whose authenticated-user redirect immediately sent the operator to
`/operator`. The observed chain was `/client/inbox` → `/login` → `/operator`,
including streamed HTTP-200 responses carrying navigation instructions. Proxy
checked cookie presence; it was not directly choosing the operator dashboard.

The new behavior is an explicit access explanation and account switch. See
`src/lib/auth.ts:98`, `src/lib/auth-navigation.ts:1`,
`src/components/account-access.tsx:4`, and `src/app/login/page.tsx:13`.
Return destinations are restricted to local application paths. Business sign-in
can return to the intended inbox; operators never receive a business role.

### 2. Loading root cause — findings and limits

The original persistent Windows skeleton **was not reproduced under the authorized
responder** in a fresh WSL Chromium context. Before changes, its inbox rendered
actual persisted conversations in approximately 650 ms. The operator redirect
was reproduced both by clicking the button and entering the inbox URL directly.
There was no evidence of an indefinitely hanging database request in that normal
responder run. A screenshot and an HTTP-200 response alone cannot establish the
cause of the original Windows observation.

Two concrete recovery defects were established:

1. `src/app/loading.tsx` previously contained only anonymous skeleton blocks, with
   no explanation or recovery actions. A blocked database read demonstrated that
   an initial streamed fallback can remain visible before React hydrates. A
   client-only timer is insufficient for that initial-document case. Recovery
   guidance and plain reload/sign-in links now exist in the initial HTML; enhanced
   ten/forty-second guidance starts when hydrated.
2. The existing root error screen used `reset()`. In installed Next.js 16.4,
   `reset()` rerenders the error boundary without refetching failed server content.
   A real database timeout reproduced a retry that kept showing the old failure.
   Both the root and new business error boundary now use the installed stable
   `retry()` API, which refetches server content. The timeout/retry browser test
   subsequently reached the real inbox successfully.

Evidence: `src/app/loading.tsx:5`, `src/app/client/error.tsx:3`,
`src/app/error.tsx:3`, `src/lib/db.ts:18`,
`tests/e2e/business-access.spec.ts`. Existing pool safeguards remain unchanged:
five-second connection timeout, thirty-second statement timeout and thirty-five-
second query timeout. No test-only server bypass or new public injection path
was introduced.

### 3. Chrome DevTools filesystem message

The running development server returns HTTP 200 at
`/.well-known/appspecific/com.chrome.devtools.json`, advertising workspace root
`/home/gongahkia/coding/projects/pronto-app`. The installed Next implementation is
`node_modules/next/dist/server/lib/chrome-devtools-workspace.js:70`.

[Chrome's automatic-workspace documentation](https://developer.chrome.com/docs/devtools/automatic-workspaces)
explains this folder mapping. The
[Chrome DevTools plugin's Windows normalization](https://github.com/ChromeDevTools/vite-plugin-devtools-json#options)
specifically accounts for WSL/Linux-to-Windows paths. A Linux path that Windows
Chrome cannot mount is consistent with the reported filesystem message. This is
an **inference**, not a reproduced Windows-console diagnosis. No application
source contains that error text, and successful Chromium inbox/round-trip tests
provide no evidence that it causes the inbox failure. Browser security, CSP,
source maps and workspace permissions were not weakened or disabled.

Windows PowerShell execution from this environment failed with `exec format
error`; Windows localhost forwarding and the user's browser profile could not
be independently exercised. The WSL HTTP/browser checks are not presented as
Windows visual acceptance. An invalid DevTools workspace mapping can be reviewed
separately in Sources → Workspaces; application usage does not require granting
filesystem editing access.

### 4. Authentication, tenant isolation and actual browser acceptance

| Scenario | Current evidence |
|---|---|
| PS.Cafe responder | Real inbox content and the persisted customer conversation render; no unresolved skeleton accepted as success |
| Customer → business → customer | Ordinary enquiry enters durable processing, mock RAG answer appears, inbox lists the same conversation, authorized takeover pauses AI, human reply reaches customer, explicit release restores AI ownership |
| Operator | Clear business-access explanation; explicit account switch; business mutation rejected with HTTP 403 |
| Missing response capability | Specific access explanation; no conversation disclosure |
| Missing business membership | Specific assignment explanation; no thrown generic membership error |
| Cross-tenant conversation | Dedicated browser negative read/takeover test; see final result below |
| Expired/shared session | Sign-in shown on refresh; API returns 401; shared-tab sign-out checked |
| Slow database read | Deliberate test-only lock held for eleven seconds; recovery links visible before hydration; real content appears after release |
| Database failure | Actual statement timeout (`57014`, sanitized message: `canceling statement due to statement timeout`); visible error; `retry()` refetch succeeds |
| Failed client navigation | Deliberately aborted RSC fetch falls back to full document navigation and renders the inbox |
| Refresh/mobile/keyboard | Covered by retained and updated Playwright acceptance |

The main-stack walkthrough recorded zero page/console errors. Final evidence
files and conversation IDs are recorded under `/tmp/pronto-tranche02`; no cookies,
authorization headers, credential values or unrestricted prompt payloads are in
this report. Initial request cancellations caused by intentionally leaving a page
are distinguishable from the deliberately injected network failure.

### 5. Account switching and local access

- Customer: <http://localhost:3000/demo/customer>.
- Business: <http://localhost:3000/client/inbox>.
- Account/sign-in: `/account`, `/login`.
- Health/readiness: `/api/health`, `/api/readiness`.
- Mailpit: <http://localhost:8025> (loopback SMTP 1025).

Use the responder in [the existing fixture guide](../demos/ps-cafe-raffles-city.md),
not the operator account, for the connected business demo. Passwords are not
reproduced here. If currently signed in as operator, open the inbox, select
**Sign out and switch account**, and sign in as the responder. Tabs in one
browser profile share cookies. Use separate profiles/private windows for
simultaneous operator and business sessions. Select Mock explicitly while real
AI credentials are unavailable.

Persistent session: `tmux attach -t pronto-local`, windows `postgres`, `mailpit`,
`web`, `worker`. Web/worker logs remain in `/tmp/pronto-tranche01/logs`; database
and Mailpit logs are in `/tmp/pronto-local/logs`. Verification logs/screenshots
are in `/tmp/pronto-tranche02`.

Restart the changed application processes with
`/tmp/pronto-tranche01/restart-app`; PostgreSQL/Mailpit stay running. Preserve all
healthy services with `/tmp/pronto-local/start-services`. To stop only this named
local stack, use `/tmp/pronto-local/stop-services`; it stops the known panes and
owned cluster without dropping data. These private `/tmp` wrappers persist for
this WSL session, not across a reboot. Do not print/source their secret values
into a report. The test-only 55434 cluster is separately owned and stopped after
verification; port identity alone was never used as a disposal safeguard.

## PRON-87 replacement and code changes

The user selected protected administrative APIs plus an authenticated CLI as the
replacement. Before deleting UI equivalents, the CLI acceptance test passed
against a fresh synthetic business in the verified disposable database. It
created draft onboarding, used separately authenticated business approvals,
rejected stale revisions/unapproved source publication, tested and published
approved knowledge, activated a synthetic local-SMTP-only channel through its
existing gates, and checked audit records. No real-provider health/activation is
implied by the synthetic fixture.

| Files | Purpose |
|---|---|
| `scripts/admin.ts`, `package.json`, `docs/ops/operator-cli.md` | Normal authenticated CLI, private session/input/output files, origin pinning, JSON/form/PDF transport, POST/DELETE support, no automatic mutation replay |
| `src/app/api/operator/inspect/route.ts` | Operator-only, non-cacheable inspection of businesses, versions, approval state, channels, staff, configuration, conversations and operations; credential/hash columns omitted |
| 22 existing `src/app/api/operator/**/route.ts` handlers | JSON success/error results replace redirects to removed UI; existing authorization, services, approval gates and audit calls retained |
| `src/lib/integrations/credentials.ts`, `src/app/api/operator/integrations/route.ts` | Fix an existing readiness check that incorrectly used the permanently disabled LLM database-storage flag; integration encryption now validates the same key material its existing store uses; LLM keys remain environment-only |
| `src/app/api/escalations/route.ts`, `src/lib/escalations.ts` | Operator CLI response path and notification instructions; business reply/release redirects and authorization retained |
| `src/lib/auth.ts`, `src/lib/auth-navigation.ts`, `src/proxy.ts`, login/logout routes and login/root pages | Explicit role denial, safe sign-in return destinations, protected account/access routes, no default HQ redirect |
| New `/account`, `/access`, `src/components/account-access.tsx` | Account identity and explicit sign-out/switch guidance; no administration dashboard or tenant impersonation |
| Customer simulator component/page, client inbox/conversation pages, `src/components/shell.tsx` | Correct workflow link, operator explanation, membership/capability states, visible business inbox navigation |
| `src/app/loading.tsx`, `src/app/error.tsx`, new `src/app/client/error.tsx` | Usable streamed loading state and actual server-content retry |
| 19 `src/app/operator/**/page.tsx` files | Removed obsolete operator frontend routes |
| Six exclusively operator components | Removed operator navigation/panels/sidebar actions, agent tuning panel, voice panel and integration panel; shared business components/services retained |
| Tests, `playwright.config.ts`, README and demo guide | Browser/CLI/security/recovery acceptance; JSON response expectations; reasonable cold-development test budget and current access instructions |

All 26 pre-existing operator API modules remain; inspection adds one. Backend
onboarding, configuration approvals, knowledge publication, channel activation,
staff permissions, worker operations and offboarding services were not deleted.
Normal business approval pages remain available. Notification links no longer
point at the retired HQ UI. Source scanning found no active legacy UI navigation;
the proxy's legacy `/operator` prefix is only a protection rule, not a link/page.

The final CLI test also passed encrypted storage/removal of a synthetic integration key; it
does not call an external provider. Existing model/embedding configuration and
provider opt-ins remain the only route to genuine inference.

## Verification commands and results

**PENDING final checks.** Results below must be updated after completion.

Regression safety: `/tmp/pronto-tranche00/test-run pnpm test:db:verify` verified
the owned loopback `pronto_test` database on 55434 using explicit matching URLs,
server identity and database marker. The persisted 55433 demonstration database
was not seeded, reset or used for destructive regression fixtures. Browser
regression/build used `/var/tmp/pronto-tranche02-app`, a copy without `.env` files,
and port 3001. This preserved the running application's `.next` assets. Browser
and Node guards denied external requests; Mailpit loopback was explicitly allowed.

The exact E2E wrapper `/tmp/pronto-tranche02/e2e` invokes `pnpm exec playwright
test --workers=1` with the isolated database, localhost:3001, deterministic mock
AI, local staff commands, synthetic delivery and network guard. The copied
Playwright dev command, fixed browser origin check and socket allowlist were
adjusted only in that owned copy from port 3000 to 3001.

Initial runs are retained as diagnostics. They exposed the `reset()` refetch bug,
pre-hydration loading behavior, cold-compilation timeouts, a test-lock idle
timeout, a missing staff-command test opt-in and incomplete new test fixture
fields. Those were corrected. A previous negative test also relied on a seed
user lacking conversation capabilities; the dedicated cross-tenant test now uses
an actually authorized responder. Intentional network/DB failures produce expected
sanitized console/server errors during those cases. They are not counted as
successful-provider evidence.

## Remaining limits and immediate next steps

1. **Genuine AI acceptance remains blocked by missing configured development
   credentials.** Current customer replies were mock generation with actual
   PostgreSQL tenant retrieval and durable processing. Real mode shows a clear
   `OPENAI_API_KEY` configuration error and does not silently create a mock session.
   Use [the existing secure provider/vector setup](../demos/customer-simulator.md)
   and rerun one substantive real-mode question before claiming PRON-86 complete.
2. Recheck the original Windows browser after signing in as the business
   responder and refreshing. The original persistent skeleton's exact cause
   remains unverified; known access and recovery defects were repaired and tested.
   Diagnose its DevTools workspace warning separately if it persists.
3. Use the documented CLI for operator administration. Existing consumers that
   expected operator form redirects must now consume JSON. Business approvals
   still require the appropriate business identity/capability.

PRON-86: connected mock customer/business acceptance is verified; genuine LLM
acceptance remains incomplete. PRON-87: frontend retirement and essential local
CLI/API replacement are implemented and locally accepted, subject to final checks.
No Jira status was changed. Hosting, real Instagram sends, Eatigo/Oddle, recaps
and further Chope live verification were not begun. This is not production
readiness or a claim of complete security/audit compliance.

## Standalone ChatGPT handover

Pronto's current source is a Next.js 16.4/React 19/TypeScript modular monolith
using PostgreSQL/pgvector and a separate durable inbox/outbox worker. On 25 October
2026 the checkout began clean on main at
`2e9ea8aec9cb14e1436398c331c8f690d6bdb055`, with migrations through 045. Prior
Tranche 00/01/experimental Chope changes were already present and preserved.

The simulated customer UI is `/demo/customer`, and the business inbox is
`/client/inbox`. They share actual persisted conversations. A PS.Cafe demo
responder can send a synthetic customer enquiry, see a deterministic mock answer
through the real worker/RAG/outbox path, review the same conversation as staff,
take over, send a human reply visible to the customer, and explicitly release AI.
An operator account is deliberately not a business-owner account.

The old unexpected operator navigation was caused by role denial redirecting to
login, which redirected the already authenticated operator to HQ. It was not an
incorrect button href. Role denial now explains the account distinction and
offers explicit sign-out/account switching with a safe return to the inbox.
Missing membership/capability has an explicit state. The original Windows
persistent skeleton was not reproduced in a normal responder session; real
database-failure tests did identify a separate Next 16.4 retry bug. `reset()` did
not refetch the failed server content; `retry()` now does. Initial streamed
loading HTML offers recovery without waiting for hydration, and actual timeout
then retry reaches the rendered inbox.

PRON-87 removed nineteen obsolete operator pages and six operator-only components,
while preserving administrative APIs, services, permissions, approvals and audit
calls. Operators land on `/account` and use `pnpm admin`. The CLI authenticates
normally, stores a private origin-bound session, reads protected inspection data,
and sends explicit API actions without automatic retry. Essential onboarding,
separate business approvals, knowledge publication, local-only activation and
audit records were exercised before UI retirement. Business roles cannot log in
to the administrative CLI or acquire operator privileges.

The local stack remains in tmux `pronto-local`, web localhost:3000 and Mailpit
localhost:8025. Genuine LLM inference is still unverified because real development
credentials are missing; selecting real mode fails clearly instead of substituting
mock output. Windows forwarding/browser-profile behavior is not independently
verified because Windows interop was unavailable. The Chrome filesystem warning
is consistent with a DevTools workspace mapping of the advertised Linux path,
not established as an application exception. Chope read/link behavior, LLM/RAG
policy enforcement and provider activation boundaries were preserved. No external
provider acceptance, production readiness or complete audit ledger is claimed.
