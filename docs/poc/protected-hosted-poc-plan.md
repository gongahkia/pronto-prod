# PRON-88 — protected hosted POC deployment plan

Prepared 25 October 2026. **Planning only: no resources created, secrets
provisioned, deployment performed or public demonstration enabled.** Prices are
USD/month before tax, LLM charges, domain registration and usage overages. Recheck
the provider console before approving expenditure. This plan targets synthetic
POC traffic, not real restaurant accounts or production acceptance.

## Recommendation and cost comparison

Use **one Render web service, one separate Render background worker and one
paid Render Postgres database with pgvector, all in Singapore**. Keep the existing
TypeScript application, PostgreSQL inbox/outbox, tenant permissions and worker.
No Redis, additional API deployment or realtime infrastructure is required.
Render supports [Singapore and regional private networking](https://render.com/docs/regions)
and [pgvector](https://render.com/docs/postgresql-extensions).

These totals are estimates calculated from current list prices, not measured
Pronto cloud consumption or vendor quotations:

| Arrangement | Monthly infrastructure estimate | Operational implication |
|---|---:|---|
| Render minimum experiment: 512 MB web + 512 MB worker + 256 MB Postgres | Approximately **$21–22** | $7 + $7 + $6 compute, plus conservative allowance for 5 GB database storage. Tight memory; cloud load/memory acceptance required. |
| **Recommended Render POC:** 2 GB web + 512 MB worker + 1 GB Postgres | Approximately **$52–53** | $25 + $7 + $19 compute, plus storage. One infrastructure administrator on Hobby workspace. |
| Same recommended Render services on Pro workspace | Approximately **$77–78** | Adds $25/workspace, supporting multiple infrastructure administrators and longer recovery/log windows. Keith's application login does not itself require a workspace seat. |
| Vercel Pro web + Render 512 MB worker + Render 1 GB Postgres | Approximately **$47–48** for one Vercel developer seat | $20 + $7 + $19 plus storage/overages; split vendors, external TLS database access, serverless pool sizing and network restrictions to resolve. Render Pro adds another $25 if needed. |
| Railway web + worker + pgvector database | Illustrative **$20–30**, plus backup storage/overages | Variable usage, not a $5 whole-stack promise. Example: 1.5 GB aggregate average RAM ($15), 0.2 vCPU aggregate average CPU ($4), 5 GB volume ($0.75), 5 GB egress ($0.25) ≈ $20. Must measure actual consumption. |

Render compute prices come from its [current pricing table](https://render.com/pricing?trk=article-ssr-frontend-pulse_little-text-block);
the current plan IDs replace legacy Starter/Standard names
[without changing their prices](https://render.com/docs/compute-plans).
Database storage is [listed at $0.30/GB/month](https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses).
The estimates conservatively budget $1.50 for 5 GB; the pricing page also mentions
1 GB included, so confirm the final billable storage in the creation screen.
Workspace Hobby is free; [Pro is now $25 flat, not $19 per seat](https://render.com/docs/new-workspace-plans).

Vercel [Pro starts at $20/month](https://vercel.com/pricing) with included usage
credit; additional seats/usage can change the total.
[Hobby is restricted to personal, noncommercial use](https://vercel.com/docs/plans/hobby),
so this business POC should budget Pro. Its functions are request bounded:
[even the newer 30-minute duration is not a persistent daemon](https://vercel.com/changelog/vercel-functions-can-now-run-up-to-30-minutes).
Keep `scripts/worker.ts` on a separate host rather than replacing it with request
handlers or cron polling. Cross-provider database traffic requires verified TLS,
acceptable access controls and a connection budget; Vercel cannot use Render's
private database hostname. Any fixed-egress solution is extra and unpriced here.

**Current Vercel protection correction:** its 9 September 2026 announcement makes
[Vercel Authentication for all deployments, including production, free](https://vercel.com/changelog/protect-production-deployments-for-free-on-every-plan).
Keith would need an authorized Vercel account as well as his Pronto account.
The current pricing table lists optional password protection at $20/project/month.
Older documentation quoting a mandatory $150 protection add-on is superseded;
do not build a budget around it. Platform authentication never replaces Pronto's
tenant and capability checks.

Railway [Hobby is a $5 minimum with $5 included usage; Pro a $20 minimum with $20 included](https://railway.com/pricing).
These are minima/credits, not fees to add twice to the example.
[Usage rates](https://docs.railway.com/pricing/plans) are approximately $10/GB RAM,
$20/vCPU, $0.15/GB volume and $0.05/GB egress per month. Its
[standard Postgres template does not include pgvector](https://docs.railway.com/databases/postgresql#extensions);
select and validate a suitable pgvector image/template and understand its support
boundary. [Volume backup storage is additionally metered](https://docs.railway.com/volumes/backups).
This is feasible, but offers less predictable cost and more database-image
responsibility than the recommended managed Render database.

Free-tier limits materially affect this demo: Render free web sleeps after
15 idle minutes, free Postgres expires after 30 days and has no managed recovery,
and there is no free background-worker instance. See
[Render's free-instance limits](https://render.com/docs/free).
Railway's trial/monthly free credits do not establish enough capacity for three
always-on services. None is a reliable zero-cost acceptance environment.

## Existing deployment assets and actual blockers

| Existing implementation | Consequence / minimum work before hosting |
|---|---|
| `next.config.ts` uses `output: "standalone"`; `Dockerfile:28` provides a nonroot `runner` target | Reuse it; explicitly select `runner`. It already binds `0.0.0.0` and reads `PORT`. The ordinary `pnpm start` script is loopback:3000 and is unsuitable as the unmodified cloud command. |
| `Dockerfile:45` provides a separate `worker`; `tsx` is a runtime dependency | Reuse this target and `pnpm worker`. Do not select the final `worker-chope` target or install its browser; Chope reads remain off. |
| Docker stages use Node 20; current local acceptance uses Node 24.21.0 | Pin and test one supported Node 24 image consistently across stages before cloud acceptance. No Docker image was built in this tranche. |
| `src/lib/customer-demo-boundary.ts:12` rejects production and requires loopback, matching test URLs, `pronto_test` and a test marker | Cloud configuration alone cannot enable the simulator. Add a separate, fail-closed protected-demo identity profile. Leave the local test verifier intact. |
| `scripts/demo/customer-simulator.ts:6`, `scripts/demo/customer-worker.ts` and PS.Cafe setup use the test verifier | Add a separately guarded hosted synthetic bootstrap/embedding command and worker startup validation. Do not make cloud databases pass the disposable-test contract. |
| `src/lib/channels/dispatch.ts:40` checks the demo boundary on synthetic delivery | Update it through the shared boundary, not a second transport or bypass. Require only the exact simulator tenant/channel identity. |
| `src/app/api/readiness/route.ts` rejects global mock mode in production | Set global `PRONTO_USE_MOCK_AI=0` when real inference is configured; immutable Mock simulator sessions still override it. A credential-free hosted mock profile needs an explicit demo readiness policy, not a weakened production check. |
| `scripts/staging-preflight.ts` expects live provider/channel staging | Add a protected-demo preflight that validates synthetic-only delivery and the demo identity instead. Do not use the CI profile to pass a hosted launch. |
| `src/lib/channels/email.ts:568` refuses local SMTP in production | No hosted Mailpit is needed. Disable local SMTP fixtures/notifications for this console-only POC, preserving local Mailpit unchanged. Do not enable an external mail provider as a workaround. |
| Existing seed scripts contain published development passwords | Never run these unchanged on an internet-reachable database. Bootstrap named demo users with privately supplied strong credentials; keep operator and business roles separate. |
| `scripts/migrate.ts` applies files in `db/migrations`; worker image omits that directory | Provide a dedicated migration/bootstrap job artifact including migrations. The standalone web runner is not an administrative CLI/migration image. |

### Protected-demo boundary design — proposed, not implemented

Use a server-only explicit environment profile (for example,
`PRONTO_ENVIRONMENT=protected-demo`; this variable does **not** exist yet) and a
unique deployment/database identity supplied by Gabriel. Verify the exact
database identity against a separately created marker for that hosted demo,
the fixed demo tenant slug/seed identity, exact console channel and authenticated
allowlisted demo users. Verify TLS, HTTPS base URL, strong secrets, tenant SQL
enforcement and synthetic-only delivery at startup. Unknown/mismatched identities
must fail closed; ordinary production still refuses simulator injection.

The new hosted marker must not equal `pronto:isolated-test-database:v1`.
Never point `PRONTO_TEST_DATABASE_URL` at the hosted database or allow regression
fixture deletion there. Do not upload the persistent local database wholesale.
Allowlist only Gabriel's approved demo staff identities; keep actor-owned simulator
history and tenant-scoped business access. Keith's business account should have
only `conversation.respond` and `conversation.release` unless separately approved.
No automatic operator impersonation, public registration or provider webhooks.

The existing signed session, database membership/session-version checks,
HttpOnly/SameSite cookie, production Secure cookie, CSRF checks and business
capabilities remain authoritative. Add bounded login-attempt throttling before
internet exposure; the current `/api/auth/login` has no such limiter. All private
pages/APIs require sign-in. Use a separate operator account for HTTPS CLI access.
If whole-site privacy beyond authenticated application data is required, add an
approved identity gateway before launch and test that the raw host cannot bypass
it; do not assume Render's public service URL provides that gate automatically.

## Required configuration and credentials

Store all secrets only in the chosen host's server-side secret configuration,
never `NEXT_PUBLIC_*`, Docker build args, committed environment files or browser
storage. Web and worker must share the same environment identity and database.

- `NODE_ENV=production`, correct `APP_BASE_URL=https://...`, platform `PORT` for web.
- `DATABASE_URL`: dedicated hosted database; private endpoint on same-region
  Render services; verify the vendor's TLS/CA requirements without disabling
  certificate validation. Separate migration-owner/runtime credentials where
  supported; no publicly open database port.
- Independent strong `AUTH_SECRET` and `PRONTO_SECRETS_KEY`; retain the latter
  securely with backups because encrypted credentials require it for recovery.
- `PRONTO_ENFORCE_TENANT_SQL=1`; do not set `PRONTO_DISABLE_TENANT_SQL_GATE=1`.
- Explicit protected-demo identity/profile settings after implementation,
  `PRONTO_CUSTOMER_DEMO_ENABLED=1`, **`PRONTO_DEMO_ONLY_DELIVERY=1` on both processes**.
- `PRONTO_USE_MOCK_AI=0` for genuine mode; `PRONTO_LLM_PROVIDER=openai`,
  `PRONTO_EMBEDDING_PROVIDER=openai`, `OPENAI_API_KEY`, optional
  `OPENAI_RESPONSE_MODEL` and `PRONTO_EMBEDDING_MODEL`. Use the existing Azure or
  Anthropic combinations in [the simulator runbook](../demos/customer-simulator.md)
  if already approved. Account model entitlement remains to be verified.
- Both `PRONTO_CHOPE_LIVE_READS=0` and `CHOPE_LIVE_READ_APPROVED=0`.
  No Meta, Telegram or external email secrets. Only the synthetic console channel
  active in this dedicated demo; no outbound fallback to real providers.
- Existing per-call limits: output 800 tokens, prompt 6,000, conversation 8,000,
  generation timeout 25 seconds by default (`src/lib/agent/runtime-limits.ts`).
  These are not a dollar spend ceiling; use a dedicated funded provider project,
  provider usage alerts/limits and one bounded acceptance conversation.

## Deployment sequence after approval

1. Implement/test the narrowly scoped protected-demo boundary, safe bootstrap,
   preflight, login throttling and image/runtime changes above. Retain existing
   tenant/approval tests and add production-mode negative tests for absent profile,
   wrong database identity, unrelated user/tenant, real provider sends and webhook
   injection. Run local production-mode browser acceptance before provisioning.
2. Obtain Gabriel's approval of provider/region, monthly budget, named users,
   synthetic data scope, LLM account/spend policy, access gate and retention period.
   Prepare a reviewed immutable source revision/image including required worktree
   changes. HEAD alone is insufficient evidence. Do not deploy an unreviewed
   moving branch; disable automatic deployments initially.
3. Create the dedicated paid Singapore database and verify its resource identifier,
   database name/user, absence of unrelated data and pgvector version. Enable the
   supported `vector` extension and apply migrations 001–045 through the dedicated
   migration job once. Serialize migrations with a dedicated checked-out database
   connection/lock; do not race web/worker startup migrations. Do not seed/reset an
   existing database. Save migration inventory and a baseline backup.
4. Bootstrap only the approved synthetic tenant, console transport, source versions
   and named accounts. Preserve knowledge publication/approval semantics and label
   public fixture facts unofficial. No production customer/channel credentials,
   default fixture passwords, active email channel or live booking reader.
5. Configure server-only secrets on web and worker; run the guarded hosted real
   embedding preparation once against the current published demo knowledge. Save
   provider/model/chunk-count evidence without text/key dumps.
6. Build two explicit targets from the same reviewed source: `runner` for web,
   `worker` for the daemon. Use the normal worker plus the new protected-demo
   startup validator, not the current local-only customer-worker script. Start
   one worker, then verify its heartbeat. Suggested initial POC tuning:
   `PRONTO_WORKER_INBOUND_LIMIT=1`, `PRONTO_WORKER_OUTBOX_LIMIT=5`,
   `PRONTO_WORKER_OUTBOX_INTERVAL_MS=5000`. Measure before increasing concurrency.
7. Start the web service bound to the platform's `0.0.0.0:$PORT`, verify HTTPS and
   secure cookies, then application readiness and protected access. Configure any
   chosen identity gateway before giving Keith the URL. Public login/static assets
   do not imply unauthenticated access to conversations. Keep admin CLI credentials
   and business credentials separate.
8. Complete the acceptance list below, verify a restore into another database and
   only then share the protected URL and credentials through an approved private
   channel. Do not activate any real messaging channel.

## Storage, worker supervision, monitoring and recovery

Conversations, knowledge/version records, jobs, outbound state and traces already
live in PostgreSQL. The web/worker need no persistent local application disk for
this POC; filesystem caches can be rebuilt. Do not retain uploads/exports/logs on
ephemeral filesystems as the only copy. Keep only synthetic data and select an
explicit deletion date; existing tenant offboarding is a separate confirmed
administrative operation, not automatic hosting retention.

The platform should restart a failed worker. `scripts/worker.ts` handles SIGTERM
by setting a flag and eventually closing the pool, but it does not interrupt the
current batch. Verify the host's grace period with an in-flight bounded request;
do not assume an immediate drain. A killed job must recover through existing
leases/retry semantics. `uncertain` outbound sends require reconciliation, not
blind resend. Do not run both worker entrypoints or multiple unmeasured replicas.

Use `/api/health` for process liveness; `/api/readiness` checks configuration,
database connectivity and heartbeat under 60 seconds. It does not prove provider
credentials/model entitlement or perform a model call. A heartbeat-dependent
readiness check should gate initial acceptance and an external alert; avoid a
web deployment/worker startup dependency cycle. Use authenticated
`pnpm admin inspect operations` for queue/error diagnostics and provider-safe
inspection. Watch memory, database connections/storage, dead/uncertain queues,
latency and worker freshness. Never expose raw traces/administrative endpoints
without their existing authentication.

Render [logs are retained seven days on Hobby and fourteen on Pro](https://render.com/docs/logging).
Paid Postgres provides [PITR for three days on Hobby or seven on Pro](https://render.com/docs/postgresql-backups),
with the most recent ten minutes unavailable for a restore target; it is not a
zero-loss recovery promise. Retain a private logical export before migrations and
after accepted fixture/embedding setup; test restoration. Restoring creates an
additional billable database. Keep encryption/auth configuration available through
the approved secret backup process. Longer offsite retention is a separately
approved operational expense, not an audit-export feature implemented here.

Rollback web and worker to the same previous tested image; leave compatible
additive database migrations in place. Never run destructive down-migrations or
reset queues to roll back. For corrupt state, pause new submissions/worker safely,
restore into a **new** database, verify identity/extension/migrations and reconcile
synthetic delivery state, then update both services together. Preserve the original
until verification and deletion approval. No automated retry of uncertain real
sends, including if a future deployment enables providers.

## Hosted acceptance required before sharing

- Unauthenticated/expired sessions receive sign-in/401; missing membership,
  unauthorized capabilities, operator-to-business access and cross-tenant/session
  requests remain denied. Check raw host, custom domain and preview URLs if used.
- Customer UI and actual business inbox render, including refresh and shared tabs;
  no unexplained skeleton accepted as success. Exercise slow/failed reads and retry.
- One substantive **Real AI** enquiry traverses durable ingestion → worker →
  tenant-approved real-vector retrieval → actual model generation → durable console
  outbox → both UIs. Save sanitized provider/model, correlation IDs, cited source
  IDs, prompt hash and provider usage evidence. A booking/greeting/policy branch
  or stubbed model is insufficient. Mock mode remains independently usable.
- Takeover suppresses AI including queued backlog; manual reply appears to customer;
  explicit release permits a subsequent new enquiry. Test no duplicate retry writes.
- Operator frontend remains 404; authenticated CLI inspection and essential
  onboarding/approval/publication gates work with separate identities.
- No live Meta sends, new Chope reads, booking writes, external SMTP, public
  injection, embedded keys, public database access or default fixture passwords.
- Worker restart/reclaim, readiness alert, graceful deployment, image rollback and
  private database restore are demonstrated. Record actual costs/memory after use.

**PRON-88 is planned, not deployment-ready or accepted.** The smallest next
engineering tranche implements/tests the protected-demo profile and bootstrap
locally. Cloud resource creation, billed plans and access invitation require
Gabriel's approval of the concrete plan.
