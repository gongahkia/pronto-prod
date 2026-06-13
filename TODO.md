# TODO

Remaining deployment-readiness drill-down items from the repository hardening pass.

## Session Handoff

- `@playwright/test` was installed before this session was interrupted. Finish the Playwright setup below or remove the dependency if browser coverage is deferred.
- The resumed pass was interrupted again before implementation continued. No Playwright config, E2E tests, CI Docker gates, readiness tests, or tenant guard fix were added yet.
- Current uncommitted/staged work also includes the channel credential encryption follow-up:
  - `scripts/encrypt-channel-credentials.ts`
  - `scripts/staging-preflight.ts` plaintext credential failure
  - `package.json` script `channels:encrypt-credentials`

## Highest Priority

1. Finish browser smoke coverage.
   - Add `playwright.config.ts`.
   - Add seeded-login E2E tests for `/login`, `/operator`, `/client`, protected redirects, and at least one core dashboard render.
   - Run against the migrated and seeded CI PostgreSQL service.
   - Use production-like `pnpm build` + `pnpm start` in CI where practical.
   - Add `pnpm test:e2e` and a GitHub Actions step that installs Chromium with Playwright dependencies.

2. Add Docker image gates.
   - Add CI steps for `docker build --target runner .` and `docker build --target worker .`.
   - Optionally smoke-run the runner image and hit `/api/health`.
   - Verify the worker image starts without needing dev dependencies.

3. Tighten readiness and proxy regression tests.
   - Unit-test `/api/readiness` for strong secrets, HTTPS production base URL, mock AI rejection in production, tenant gate status, DB pass/fail, and `Cache-Control: no-store`.
   - Unit-test `src/proxy.ts` for protected route redirect/401, nonce propagation, production CSP without `unsafe-eval`, frame denial, HSTS, and static asset matcher assumptions.

4. Make tenant isolation more rigorous.
   - Current runtime SQL gate is useful but is not equivalent to PostgreSQL Row Level Security.
   - Fix the specific runtime guard bug found during the resumed pass: `src/lib/db.ts` currently allows tenant-table `insert` statements when the client id appears anywhere in bound values. It should only allow inserts where `client_id` is explicitly present in the inserted column list and bound to the current session client id.
   - Add a regression test for the bug above, for example an insert into a tenant table with `client_id` omitted but the current client id present in unrelated JSON/metadata must be rejected before reaching `pg`.
   - Decide whether deployment requires DB-enforced tenant isolation.
   - If yes, add RLS policies using transaction-local app context, for example `set_config('app.current_client_id', ...)`, and integration tests that prove cross-client reads fail at the database layer.
   - Be careful with table owners and bypass behavior; validate `ENABLE ROW LEVEL SECURITY` versus `FORCE ROW LEVEL SECURITY` against the actual DB role model.

5. Add DB-backed integration tests.
   - Run migrations against a real PostgreSQL/pgvector instance in CI.
   - Verify seed creates operator and client logins.
   - Verify credential encryption migration/backfill converts plaintext active channel credentials and preflight rejects leftover plaintext.
   - Verify tenant guard behavior against representative real queries, not only mocked `pg`.

## Additional Coverage

6. Expand outbox and inbound-processing tests.
   - Assert answered agent replies are persisted to `outbound_messages` with stable idempotency metadata.
   - Assert failed outbound sends remain retryable and do not lose the agent/customer message state.
   - Add coverage for skipped sends and duplicate idempotency keys.

7. Expand LLM/provider failure tests.
   - Prove missing provider credentials fail closed outside explicit mock mode.
   - Prove embedding/provider failures create escalations instead of crashing inbound processing.
   - Add one test for failover exhaustion producing a durable escalation path.

8. Add production preflight and release-runbook gates.
   - Document the exact staging sequence: migrate, seed or create pilot client, encrypt channel credentials, run preflight, run browser smoke, then deploy.
   - Ensure `pnpm staging:preflight` fails on mock AI, HTTP `APP_BASE_URL`, weak secrets, unreachable DB, inactive live channels, and plaintext credentials.

9. Update operational docs.
   - Update `docs/AGENT_CONTEXT.md`, `docs/HUMAN-SETUP.md`, and `docs/setup/staging-env.md` with Docker, worker, readiness, credential encryption, and CI expectations.
   - Add worker runbook notes for outbox retries, failure alerts, and safe restarts.

10. Add accessibility and responsive smoke checks.
   - Add basic Playwright assertions for no obvious mobile layout breakage on login/operator/client pages.
   - Consider adding `@axe-core/playwright` only if accessibility checks will be maintained in CI.

11. Re-run full verification after the above.
   - `pnpm audit --audit-level moderate`
   - `pnpm typecheck`
   - `pnpm lint`
   - `pnpm test`
   - `pnpm test:coverage`
   - `pnpm build`
   - `pnpm test:e2e`
   - Docker runner and worker builds

## Known Local Blockers

- Local PostgreSQL was not reachable on `localhost:55432` during this pass, so DB-backed preflight and migration smoke could not be fully verified locally.
- Docker daemon access was denied via `/var/run/docker.sock`, so Docker builds could not be verified locally.
