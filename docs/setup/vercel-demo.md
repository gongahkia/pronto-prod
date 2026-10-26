# Protected Vercel demonstration deployment

Prepared 25–26 October 2026. **No deployment, paid plan or cloud resource has been
created.** Obtain Gabriel's hosting, network-policy and budget approval before
executing the cloud steps below. This is an unofficial, synthetic PS.Cafe Raffles
City demonstration, not a customer deployment.

## Architecture and monthly planning budget

Recommend Vercel Pro for the existing Next.js application, one persistent Render
Starter Node worker, and Neon Launch PostgreSQL with pgvector, subject to approved
network controls and spending limits. Render managed Postgres is the simpler
worker-private-network alternative compared below. Vercel Functions enqueue
durable work; they do not run the worker loop. Keep web and worker on the same
reviewed application revision and database. Select Node 24 in Vercel Project
Settings to match the tested runtime and Docker image; the repository's existing
`>=20` engines range alone does not pin the cloud runtime. Node 24 is supported
for Vercel builds/functions ([official runtime announcement](https://vercel.com/changelog/node-js-24-lts-is-now-generally-available-for-builds-and-functions)). Prefer nearby Singapore regions after
checking service availability and provider processing terms.

| Arrangement | Approximate USD/month, excluding tax, AI and overages | Limitation |
|---|---:|---|
| Vercel Pro + Render Starter worker + Neon Free | $27 | Conditional limited-hours demonstration; not an always-on free database promise |
| Vercel Pro + Render Starter worker + Neon Launch | About $46.43 in the example below | Usage billing; approve a ceiling and database network policy |
| Vercel Pro + Render Starter worker + Render 1 GB Postgres | About $47–48 including 5 GB storage allowance | Vercel requires the external DB endpoint and an approved network path |
| Same Render DB arrangement with Vercel Static IPs | About $147–148, plus egress | Required if fixed Vercel egress is the chosen database allowlist control |

Calculation: Vercel Pro $20, Render worker $7, Render 1 GB database $19,
storage approximately $1.50 at $0.30/GB. Neon Launch example: 720 hours × 0.25 CU ×
$0.106/CU-hour + 1 GB × $0.35 = $19.43; add $27 web/worker. This is a planning
example, not a benchmark or maximum bill. Render's optional Pro workspace adds
approximately $25/month. Extra seats, compute, transfers, backups and taxes vary.

Neon currently advertises 100 CU-hours/project/month and 1 GB on Free. At 0.25 CU,
100 CU-hours covers 400 awake hours. This application's polling/heartbeat worker
can keep the database awake: 720 hours would consume 180 CU-hours. Do not select
Free for an unattended always-on worker on the assumption that it will sleep.
The managed endpoint, TLS authentication and any IP restrictions require approval;
do not silently open a restricted database to all addresses to accommodate Vercel.

Vercel Hobby is limited to personal, non-commercial use. Budget Pro for Pronto's
business POC unless Vercel confirms another eligible arrangement. All-deployment
Vercel account protection is now available on every plan; the old assumption that
production protection necessarily costs $150/month is outdated. A separate
password-protection add-on is listed at $20/project/month. Vercel Static IPs are
listed at $100/project/month plus applicable transfer. None is activated here.

Sources checked 25–26 October 2026: [Vercel pricing](https://vercel.com/pricing),
[Hobby eligibility](https://vercel.com/docs/plans/hobby),
[production protection announcement](https://vercel.com/changelog/protect-production-deployments-for-free-on-every-plan),
[Static IPs](https://vercel.com/docs/networking/static-ips),
[Render pricing](https://render.com/pricing), [Neon pricing](https://neon.com/pricing).

## Prepared code and fail-closed boundary

- `vercel.json`: frozen pnpm install, Next.js build, `sin1`; no deployment hook,
  credentials, seed command or migration during build.
- `Dockerfile`: Node 24; `worker-demo` runs `pnpm demo:protected:worker`;
  `migration` verifies the protected identity then runs migrations. The existing
  ordinary worker and optional Chope image remain separate targets.
- `deploy/protected-demo.env.example`: placeholders only. Use separate server-side
  secret environments for preview, protected demo and any future production.
- `PRONTO_DEPLOYMENT_PROFILE=protected-demo` requires production mode, HTTPS,
  strong independent secrets, invited user UUIDs, TLS database verification,
  synthetic-only delivery and both Chope read flags explicitly zero. A
  `PRONTO_TEST_DATABASE_URL` is forbidden. Ordinary production still rejects the
  simulator; enabling its old local flag alone does not enable hosted injection.
- The hosted database must carry the exact comment
  `pronto:protected-demo:v1:<PRONTO_DEMO_DATABASE_ID>`. This is distinct from the
  disposable-test marker. Test reset/seed safeguards are not relaxed.
- Hosted worker ingestion and dispatch accept only the exact synthetic tenant's
  console transport. No SMTP, Meta or other external delivery is allowed by this
  profile, even if someone accidentally activates another channel.
- Login throttling uses PostgreSQL, not per-function memory: eight attempts per
  normalized account and 120 globally per 15-minute window; identifiers are HMAC
  hashed. Failure to persist the limiter fails closed. Successful authentication
  still requires the normal password/session/role checks.
- Vercel pools use `@vercel/functions` `attachDatabasePool`, default two
  connections per instance, zero minimum and five-second idle cleanup. The
  persistent worker can explicitly use four. Limit total instance concurrency to
  the managed database's actual connection budget. Pool cleanup does not replace
  provider-side pooling or a concurrency cap.

## Reviewed deployment sequence (approval required before provisioning)

1. Approve the vendor accounts, spending ceiling, user regions, protection method,
   database network policy and synthetic-only data policy. Confirm free API
   account status in Google AI Studio/Groq Console separately; application flags
   are attestations, not billing verification.
2. Create a dedicated empty managed PostgreSQL database and enable pgvector. Do
   not reuse production, the local persistent demo, or a regression database.
   Verify provider project/database identity using its console and a read-only
   SQL connection. Generate a new UUID, then have the database owner apply the
   exact protected-demo database comment. The bootstrap script never marks a DB.
3. Configure fresh random `AUTH_SECRET` and `PRONTO_SECRETS_KEY`, database TLS,
   approved HTTPS `APP_BASE_URL`, allowed user UUIDs and all template safeguards.
   Never copy fixture passwords. Only server environments receive provider keys.
4. Take/verify a provider snapshot or private export before migrations when data
   exists. Use the **direct/session** database endpoint for `pnpm migrate`;
   transaction-pooled connections cannot safely carry its session advisory lock.
   Set `DATABASE_URL` to that direct endpoint for the one-off migration process.
   Run `pnpm demo:protected verify`, then `pnpm migrate` once. Migration execution
   is serialized and each file uses one checked-out transaction connection.
5. Prepare an owned regular mode-600 JSON file, outside Git, containing 2–20
   invited synthetic accounts. Each has UUID `id`, synthetic `.test`/`.invalid`
   `email`, `name`, `role` (`client` or `operator`), and a distinct strong
   `password` of at least 16 characters. Include both roles and exactly match
   `PRONTO_DEMO_ALLOWED_USER_IDS`. Keep the administrative identity separate from
   Keith's tenant responder. Deliver credentials through an approved private
   channel; there is no public registration/reset flow in this tranche.
6. Run `pnpm demo:protected bootstrap /private/path/accounts.json`. It refuses an
   existing populated database. It creates only the unofficial PS.Cafe tenant,
   reviewed public demo fixtures, Mock embeddings, console channel, limited
   responder grants and audit event. It creates no provider credentials.
7. Start **one** persistent `worker-demo` process with automatic restart and
   SIGTERM grace time. Deploy Vercel web only after approving the concrete
   revision/configuration. Configure **All Deployments** protection and invite
   Keith's Vercel identity; Pronto sign-in remains independently required. Use
   stable `APP_BASE_URL` per isolated environment. Authentication redirects pin
   that HTTPS origin, so temporary preview domains need their own reviewed config.
8. Run the Mock acceptance below before adding API keys. Then configure
   `GEMINI_API_KEY`, `GROQ_API_KEY`, `PRONTO_DEMO_REAL_AI_APPROVED=1` and the two
   verified free-tier attestation flags in web, worker and the embedding process.
   Run `pnpm demo:protected embed-gemini` once for current published demo facts.
   No paid Batch API is used. Run `pnpm demo:protected preflight` and restart web
   and worker with matching settings. Preflight intentionally fails without both
   providers and current real embeddings; Mock operation remains independent.

Web may use the provider's pooled endpoint with TLS verification; worker and
migrations can use the direct endpoint. Do not run test suites, local fixture
seeds/removals or `test:db:mark` against this protected database.

## Authenticated administration behind platform protection

Follow [operator-cli.md](../ops/operator-cli.md). App authentication, audited
administrative APIs and existing approval capabilities remain mandatory; operators
do not acquire business permissions. If Vercel's account gate blocks the CLI,
securely configure its automation bypass token as
`PRONTO_VERCEL_PROTECTION_BYPASS` and pin the exact approved HTTPS origin in
`PRONTO_VERCEL_PROTECTION_ORIGIN` in the **local CLI environment only**. The CLI
sends that platform header only to the matching origin, refuses redirect following,
and still signs in with an authorized Pronto operator and private session file.
Keep bypass credentials out of browser code, JSON reports and shell history.
This header integration has deterministic tests; actual Vercel gate acceptance
still requires the approved deployment. Do not disable platform protection.

## Acceptance, monitoring and recovery

Verify `/api/health`, `/api/readiness`, a fresh worker heartbeat via authenticated
CLI operations inspection, and queue errors/backlog. Readiness does not call the
providers or certify account billing. Configure an HTTPS monitor able to pass the
platform gate, worker restart/error alerts and private log retention before the
demo. No offsite log-export service is created here.

Browser acceptance: anonymous rejection, authorized responder sign-in, actual
customer/inbox rendering, Mock persisted round trip, takeover (no automated reply),
manual response, explicit release, refresh, separate operator rejection and 429
login limit. Then execute the same substantive public knowledge enquiry in two
new conversations, Gemini and Groq independently. Require actual provider response
ID/model/token usage, current tenant source citations, `real` metadata and the
same delivered answer in both UIs. Mock/stubbed calls, booking invitations and
configuration indicators do not satisfy real-AI acceptance. Check 429/provider
failure without automatic provider/model fallback. Do not test real Meta/Chope.

Keep private DB snapshots/exports before schema changes and rehearse restore into
a different dedicated database. Render PITR currently offers three days on Hobby
workspaces/seven on Pro, with roughly the latest ten minutes not restorable;
restoring creates a new billable instance. Neon Free has a limited restore window,
not a substitute for approved recovery. Confirm the selected plan's retention in
its console. See [Render recovery](https://render.com/docs/postgresql-backups).

Rollback: stop accepting new demo sends, gracefully stop the owned worker, restore
the previous web/worker revision together and preserve additive migrations if
compatible. Do not delete or downgrade schema/data automatically. If necessary,
restore the verified snapshot into a new DB, verify its identity, update reviewed
secrets/marker, then rerun the acceptance checks. Durable queues support retry;
inspect failed jobs before replaying, and preserve deduplication identifiers.

The local TLS/production-profile exercise is evidence for these application
boundaries only. It does not verify Vercel runtime behavior, platform protection,
managed recovery, cloud networking, performance or external AI account acceptance.
