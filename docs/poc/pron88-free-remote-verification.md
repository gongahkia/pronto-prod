# PRON-88 — S$0 protected remote POC verification

26 October 2026, Singapore. **PARTIAL overall:** the free protected HTTPS endpoint
is running; production-mode Groq/customer/business/human-handoff acceptance and
guarded regressions passed. Gabriel reports completing Cloudflare sign-in in his
own browser. Keith's independent PIN/app sign-in and a complete human-driven
remote enquiry/inbox/handoff round trip remain pending. No paid deployment occurred.

## 1. Actual state and preservation

- Branch `main`, HEAD `8e0c698eb0f815b68fb18e7b3057e7c7da24be81`.
- Entry: 24 modified tracked files, 1 untracked Groq report, no staged changes.
  Existing Groq-only work was preserved, not assumed to be committed.
- Current scope adds 6 modified tracked paths, extends 2 already modified paths,
  and adds 6 new files: expected final total **30 modified, 7 untracked, 0 staged**.
  Hash comparison confirmed 23 of the 25 entry files byte-unchanged; only the
  existing protected-demo script and Vercel runbook were extended intentionally.
- No commit, push, reset, clean, rebase, migration-history change or Jira/Confluence
  update. No environment file was overwritten. Provider key absent from Git diff
  and browser static bundles in an exact-value check; no value was printed.
- Node 24.21.0, pnpm 10.33.0, Next 16.4.0, React 19.2.4; PostgreSQL 18.6 and
  pgvector 0.8.0. Migrations remain 001–047.

The Next installed self-hosting guide and repository/runbook instructions were
read. The separate production build does not touch the active development `.next`.
Main PostgreSQL 55433, web 3000, durable worker and Mailpit 8025 were preserved.
Destructive fixtures ran only on the separately identity-verified 55434 database,
not the persistent local or remote POC data; that regression cluster was stopped
after testing. Port numbers were never treated as identity proof.

## 2. Implementation/configuration

| Path | Change for this request |
|---|---|
| `scripts/demo/remote-demo.ts` | Private configuration, Groq-only environment, production standalone/worker supervision, fixed protected tunnel launch, anonymous auth probe, closed startup gateway, private status/revoke/stop control socket. |
| `scripts/demo/remote-boundary.ts` | Owned mode-600 reads, exact two-address policy, assigned-host validation, narrow route/method allowlist, proxy header replacement, request/time limits and stream revocation. |
| `package.json` | `pnpm demo:remote` entry point; no dependency/lockfile change. |
| `src/lib/http/csrf.ts` | Production compares complete origins, including scheme/port. Forwarded headers never add trusted origins. Private matching-loopback CLI evidence remains allowed. Development behavior is retained. |
| `src/proxy.ts` | Production unauthenticated redirects use the configured HTTPS public origin, rather than an internal proxy URL. |
| `scripts/demo/protected-demo.ts` | Stronger read-only preflight: exact unofficial tenant, synthetic identity/knowledge/conversation boundary, existing account/channel/credential/Groq checks. |
| `tests/unit/{remote-demo,csrf,proxy}.test.ts` | Allowlist, route/URL validation, traversal/debug denial, closed/revoked gateway, header stripping, exact production origin and redirect checks. |
| `deploy/remote-demo.config.example.json` | Placeholder-only launcher configuration; no secret or private email. |
| `docs/demos/remote-poc.md` | Start/stop/revoke, private accounts, recovery, limitations and Keith's instructions. |
| `docs/setup/vercel-demo.md`, `docs/poc/protected-hosted-poc-plan.md` | Mark paid cloud plans deferred and point to current free method. |
| This report | Current evidence and remaining acceptance boundary. |

Only local temporary runtime artifacts were installed/generated. The official
`cloudflared 2026.10.3` Linux amd64 binary is in `/tmp/pronto-remote`; its digest
matched the official release asset and its help exposes `--allowed-mail`.
The launcher's pinned hash prevents accidentally using an older unprotected
binary. Source inspection verified OTP provisioning and signed-email recipient
enforcement in Cloudflare's implementation.

The two exact email addresses explicitly approved in this session were saved in
owned mode-600 `/tmp/pronto-remote/allowed-emails.json`; no wildcard or inferred
extra identity was added. The provider key stays in the existing private `.env`;
the launcher reads only Groq/key approval settings in memory. Cloudflared receives
neither API keys nor database/authentication secrets in its environment.

An additive dedicated `pronto_remote_poc` database was created in the already
owned local TLS cluster on 55435 after verifying its data directory, database
marker, server port and administrator identity. Existing databases were not
relabelled or reset. The new database has a distinct protected marker and
SCRAM-authenticated role without superuser/create-role/create-database powers.
Migrations were applied only to that newly created database. Existing bootstrap
created one unofficial public-fact tenant and separate strong synthetic
administrator, Gabriel responder and Keith responder identities. Responders have
conversation response/release grants, not operator permissions.

## 3. Temporary HTTPS access

Current URL, intentionally kept stable while Gabriel tests:

- Customer: <https://www-analysts-apr-manufacturer.trycloudflare.com/demo/customer>
- Business: <https://www-analysts-apr-manufacturer.trycloudflare.com/client/inbox>

The [Cloudflare Quick Tunnel documentation](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)
supports email-PIN protection without buying a domain or creating an account.
This temporary testing service has no uptime guarantee, a 200 in-flight request
limit, no SSE support and a new hostname on restart. Pronto's existing polling
works within that model. This is not production hosting or a public launch.

The original dev server is **not exposed**. Only 127.0.0.1:3004 is the tunnel's
fixed destination; it forwards approved demo routes to the standalone production
web on 127.0.0.1:3003. PostgreSQL, Mailpit, debug/metrics, provider webhooks and
administrative routes are not tunnel destinations. Metrics bind privately to
127.0.0.1:20250. No Windows/router inbound port was opened.

## 4. Security/acceptance evidence

| Check | Current result and limit |
|---|---|
| Protected tunnel startup | PASS: protected startup marker and OTP declaration; fresh unauthenticated HTTPS probe redirects to `https://login.trycloudflare.com/authorize` for the assigned hostname before origin opens. |
| Unauthenticated remote UI | 302 to provider auth broker; application content unavailable. |
| Unauthenticated remote mutation | 401 at tunnel authorizer. |
| Forged provider email header | 302 to auth broker; no origin access or header-derived app identity. |
| Email delivery/PIN | Cloudflare delivered the requested PIN. The mail connector withheld the code; no bypass attempted. Gabriel chose his own browser and subsequently reported completing Cloudflare login. This is user-reported, not an automated authenticated remote browser capture. |
| Unlisted genuine email identity | Exact allowlist/code policy verified. A successful PIN followed by rejection for a real unlisted identity was not exercised. No unrelated inbox was used or emailed. |
| Production app authentication | PASS locally with generated synthetic responder credentials; separate app authentication remains required after the PIN. |
| Cookie security | Secure=true, HttpOnly=true, SameSite=Lax observed in the production browser. |
| CSRF/proxy origins | Cross-origin mutation 403; unit checks reject HTTP downgrade, wrong port, forged host/forwarded data; production redirects use configured HTTPS. |
| Anonymous/invalid app sessions | 401/401 on private app API checks. |
| Responder administrative API | 403 on private origin; administrative routes excluded from remote forwarding. |
| Operator business mutation | 403; operator login does not grant a business role. |
| Different actor's simulator session | 404; same-tenant users do not acquire each other's simulator history. Full tenant separation also covered by guarded database regressions, not a live second restaurant tenant. |
| Login throttling | 429 after bounded synthetic failed-account attempts; persistent DB limiter retained. |
| Administrative CLI | PASS: operator login → inspect operations → logout against private `http://localhost:3003`; no impersonation or DB bypass. |
| Synthetic/delivery preflight | One tenant, zero integration credentials, zero non-console channels, fresh worker, no pending/processing jobs. |
| Secrets | No current Groq key in Git diff or browser bundles. Private artifacts/credentials mode 600, containing directory 700. |
| Restart/shutdown | Two separate protected maintenance connectors were started/stopped against a closed synthetic 503 origin. Both auth gates passed; both shut down cleanly and stopped serving their old connector; the second obtained a fresh hostname. Main demo URL/stack were left untouched. |
| Immediate origin revocation | Gateway closes existing sockets and new forwarding; covered by code/unit checks. The primary `revoke` command was not invoked while Gabriel was actively using its URL. |
| Backup | Mode-600 local custom-format `pg_dump` created and archive index parsed. No offsite upload or overwrite-restore performed. |

Public HTTPS certificate validation passed in a fresh Chromium context without
ignoring errors. Local self-signed TLS browser acceptance explicitly allowed
only that local test certificate; backend database TLS uses certificate verification.
The local database certificate expires **27 October 2026, 23:30 Singapore time**;
renew it and the private CA configuration before a later demonstration. The
launcher refuses expired certificates on startup. Do not turn verification off.

## 5. Genuine Groq and customer/business flow

One bounded substantive production-mode enquiry was generated externally:

> What is your address and what are your standard opening and closing hours?

Conversation `1e09e7cc-a3ab-41a6-be39-eef2c3f2ed66`, actual
`groq / openai/gpt-oss-20b`, response
`chatcmpl-c7acfbd1-6a3c-4c02-b445-e96df6f9ec5f`, **776 input / 162 output tokens**.
The model identified the public Raffles City address and 10am–10pm standard hours,
with last food orders at 9pm. Exactly one recorded generation and **zero embedding
events**. Retrieval was tenant-scoped approved `local_text`, source
`00000000-0000-4000-8000-00000000a201`, hash
`e4edaf3d042ea843ca0dea865e88ac3e2cb06ecfbd3540d328190da302b5a0eb`.
Source version is null because this curated fixture has no version history; none
was invented. These are Pronto-curated public facts, not restaurant approval.

The actual production browser rendered the reply and business thread, then
takeover → manual reply → customer sees reply → explicit release succeeded.
No additional model call was generated by completing the handoff assertions.
Browser console/page errors were empty. Gemini remained unavailable and Mock
independently available. This acceptance used local HTTPS to the production
instance before remote activation; it is **not** proof of the entire remote PIN
→ Pronto → Groq → business round trip.

Visual inspection also found a pre-existing business-shell copy mismatch:
the global Mock-default preview banner says answers are simulated, even when the
conversation's pinned real Groq profile overrides that default. Individual reply
labels and actual provider-returned usage correctly show real inference. This
banner is misleading for this POC; it is a UI limitation, not evidence of a mock
model call. Correct its profile-aware copy in a small follow-up, then rebuild
during an agreed pause rather than interrupting Gabriel's live remote test.

A first browser assertion compared the customer transport footer to the raw
business message and failed. The existing CSAT footer explained the difference;
the test resumed the same persisted conversation and verified the underlying
answer/handoff without another inference call. The remote launcher now disables
that existing optional footer so it does not advertise a non-demo route.

## 6. Tests executed now

| Command/check | Final result |
|---|---|
| `/tmp/pronto-tranche00/test-run pnpm test --maxWorkers=2` | 483 passed, 104 skipped, 0 failed (587 tests). |
| `/tmp/pronto-tranche00/test-run pnpm test:db:verify` | PASS before destructive fixture suites. |
| `/tmp/pronto-tranche00/test-run pnpm test:db` | 579 passed, 8 skipped, 0 failed (587). Eight skips are separately opted-in local-mail tests. |
| `/tmp/pronto-groq/e2e` | 27 passed, 0 failed; isolated port 3001/disposable DB 55434; provider sockets blocked. |
| `pnpm lint`, `pnpm typecheck` | PASS. |
| Guarded `pnpm build` in `/var/tmp/pronto-groq-app` | PASS; original development build preserved. |
| `pnpm demo:remote verify --config /tmp/pronto-remote/config.json --remote` | PASS; private profile/marked DB/Groq text readiness and binary/allowlist checks, no inference or new tunnel request. |
| Production HTTPS/Groq/browser acceptance | PASS as detailed above; one actual generation. |
| Private API/CLI security acceptance | PASS, exact statuses in the preceding matrix. |
| Public gate/maintenance lifecycle | PASS, main URL uninterrupted. |

The first unit/full-DB runs caught an old proxy test expecting an HTTP/internal
redirect. It was updated to assert the new configured HTTPS origin under forged
forwarded headers, then both complete suites passed. Launcher preparation also
caught an existing-log-directory startup error; `mkdir` is now safely recursive.
No failed startup exposed an unprotected app.

Evidence/logs/screenshots are private under `/tmp/pronto-remote`:
`local-acceptance.json`, `security-acceptance.json`, `remote-gate.json`,
`lifecycle-check.json`, `final-state.json`, `unit-final.log`, `db-final.log`,
`e2e.log`, `build.log`, `screenshots/groq-real-{customer,business}.png`.
No OTP, API key, password or session cookie is included in this report.

## 7. Keith's access and lifecycle commands

Send Keith the current customer URL. He completes Cloudflare PIN using his
approved address, then separately signs into Pronto as
`keith@pronto-remote.test`. Gabriel must privately deliver the strong application
password from `/tmp/pronto-remote/client-keith.json`; do not send the administrator
credentials. Gabriel's separate responder login is `gabriel@pronto-remote.test`,
with its private credential file `client-gabriel.json`.

Choose Groq, start a conversation, use the substantive public-fact question,
open the business inbox, inspect the same thread, take over/reply, check the
simulator and release. Do not use genuine customer or sensitive business data.

```sh
pnpm demo:remote status --config /tmp/pronto-remote/config.json
tmux attach -t pronto-remote
tail -f /tmp/pronto-remote/logs/controller.log
pnpm demo:remote revoke --config /tmp/pronto-remote/config.json
pnpm demo:remote stop --config /tmp/pronto-remote/config.json
```

`revoke` closes remote origin access and terminates the connector while leaving
the local production app intact. `stop` stops only the owned demo web/worker/
tunnel, leaving both databases and the original dev stack intact. After exit:

```sh
tmux respawn-pane -t pronto-remote:app /tmp/pronto-remote/start-remote
pnpm demo:remote status --config /tmp/pronto-remote/config.json
```

Do not restart an active pane while someone is demonstrating. Every new tunnel
gets a new URL; send the new URL and sign in afresh. The complete
[runbook](../demos/remote-poc.md) documents private CLI, first launch, local backup,
safe recovery and certificate renewal requirements. Keep Windows/WSL awake and
connected; sleep/reboot interrupts access. `/tmp` artifacts need preservation
before reboot. Groq Free quotas can fail calls; no paid or provider fallback occurs.

## 8. Cost and completion recommendation

**Zero new paid infrastructure/subscription/domain resources.** No Vercel,
Render, Neon, Railway, paid Cloudflare resource, payment method or paid Groq
upgrade was created. Groq Free status is the supplied private attestation; actual
account invoices were not inspected, so no claim of independently proven zero
billed API usage is made. No real Meta/SMTP/Chope/booking operations occurred.

PRON-88 can complete this narrow demonstration acceptance after Keith verifies
his own PIN/app login and the full customer/Groq/inbox/manual-handoff flow over
the live URL. The safe free access mechanism is implemented and running; leave
the ticket open until that remaining acceptance is recorded. No Jira was changed.
Do not revive the deferred paid cloud plan or claim production readiness.

## 9. ChatGPT handover

Pronto's current POC uses only Groq GPT-OSS 20B as its required external AI
provider, with tenant-scoped approved PostgreSQL text retrieval and no embedding
API. Existing optional providers and Mock remain. One substantive generation
through the production-mode worker and both actual UIs passed, as did human
takeover/manual reply/release and guarded regressions (483 unit/non-DB passes,
579 DB-inclusive passes, 27 browser passes; skips listed above).

PRON-88 now uses a free protected Cloudflare Quick Tunnel to the existing WSL
host, rather than paid Vercel/Render/Neon. A production standalone web and separate
worker run in `pronto-remote`, with a dedicated synthetic-only local TLS database.
The original local stack/data/worktree remain intact. Exactly Gabriel and Keith's
explicitly approved email addresses are allowed; independent application logins
and business permissions remain mandatory. No automatic impersonation or operator
role elevation was added. Remote routing excludes admin/debug/provider endpoints;
administration remains through the protected private CLI. Email/auth sessions are
not credentials to share. Current URL is temporary and must be read from status.

Anonymous gate rejection, genuine Groq local-production processing, security
checks and separate protected tunnel shutdown/restart passed. Gabriel reports
successful Cloudflare login in his browser; the full authenticated remote
customer/business flow and Keith-specific acceptance remain to be recorded.
Keep PRON-88 partially accepted until those checks finish. The local TLS
certificate expires late 27 October Singapore time; host uptime, temporary `/tmp`
state and Free quotas are explicit demo limitations. No paid resources, real Meta
sends, SMTP delivery, new Chope reads, reservations, commits or external tracker
changes occurred. The paid production hosting plan remains deferred.
