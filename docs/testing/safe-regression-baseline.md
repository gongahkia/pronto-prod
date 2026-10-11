# Safe regression baseline

## Ordinary tests

`pnpm test` runs the normal Vitest suite. It uses deterministic mock AI, blocks
unmocked `fetch` and external sockets, and leaves PostgreSQL integration tests
skipped. Tests that need a provider response inject a fake `fetch`. No live
provider credentials are needed. `pnpm test:coverage` uses the same harness;
when `PRONTO_RUN_DB_TESTS=1`, it also runs the guarded DB fixtures.

The separate `pnpm test:known-defects` suite intentionally exits nonzero while
known defects remain. Do not add it to the passing CI gate. Move each specification
to the normal suite when its behavior is fixed.

## Isolated PostgreSQL tests

Use a newly created local database named **pronto_test** on an explicit loopback
port. Do not reuse the development `pronto` database or an SSH tunnel to a
shared environment. For example:

```sh
docker run --rm -d --name pronto-regression-db \
  -e POSTGRES_DB=pronto_test -e POSTGRES_USER=pronto_test \
  -e POSTGRES_PASSWORD=pronto_test \
  -p 127.0.0.1:55433:5432 pgvector/pgvector:0.8.0-pg16
export PRONTO_TEST_DATABASE_URL=postgres://pronto_test:pronto_test@127.0.0.1:55433/pronto_test
export DATABASE_URL="$PRONTO_TEST_DATABASE_URL"
PRONTO_ALLOW_TEST_DB_MARK=1 pnpm test:db:mark
pnpm test:db:verify
pnpm migrate:test
pnpm seed:test
pnpm test:db
```

Mark only a newly created disposable database. The verifier requires the same
explicit URL in both variables, a loopback `pronto_test` destination, a local
server address, and a database comment marker. It runs before test migrations
and DB-backed tests. Database fixtures use unique IDs and remove their client
rows after tests. The CI workflow uses the same marked database contract.

The DB suite sets test-only auth/encryption values and
`PRONTO_PREFLIGHT_IGNORE_DOTENV=1`. That flag prevents the preflight subprocess
from overriding the isolated database URL with local `.env` files. It has no
effect on normal preflight runs.

`pnpm build` followed by `pnpm test:e2e` can be run with the same two database
variables. The E2E command verifies the test database, forces mock AI, and
preloads a network guard for the application and Playwright Node processes.
Only loopback ports for the test database and local web server are allowed.
The current Playwright suite blocks browser requests outside localhost and
exercises login and dashboards, not channel sends. Install its browser once with
`pnpm exec playwright install chromium` if it is absent.

For a guarded `pnpm build`, also set `PRONTO_USE_MOCK_AI=1`,
`NODE_OPTIONS=--import=./tests/setup/network-guard.mjs`, and
`PRONTO_TEST_ALLOW_BUILD_IPC=1`. The last flag permits Next's local ephemeral
build-worker IPC while still rejecting non-loopback connections; it is not set
for E2E tests. Playwright always starts its own guarded server rather than
attaching to an existing process on port 3000.

## Behavioral status

| Scenario | Current specification |
|---|---|
| A. Inbound retry after processing failure | Confirmed: retry sees the persisted message and does not rerun the agent. |
| B. Customer message during open handoff | Confirmed: the agent still runs. |
| C. Disabled channel inbound | Confirmed: shared processor accepts it. |
| D. Unverified order/tracking identifier | Confirmed: lookups return status without requester ownership input. |
| E. Cross-tenant supported knowledge read | Negative DB test passes for source lookup and RAG retrieval; this is not proof of complete tenant isolation. |
| F. Provider accepted send, local status write failed | Confirmed in failure injection: next retry sends again. |

A–D and F live under `tests/known-defects`; E lives in the passing DB baseline.
The tests use fake providers and are not evidence that Meta, email, commerce,
calendar, or delivery provider accounts work in production.

## Verified local boundaries

| Area | Local evidence | Remaining limit |
|---|---|---|
| Channel normalization and webhook signatures | Unit adapter/signature tests and normalized-channel integration test | No live webhook delivery or provider credential check |
| Tenant conversation, message persistence and outbound queue | `tests/integration/message-baseline.test.ts` with real isolated PostgreSQL and fake sender | No cross-provider delivery guarantee |
| RAG and tenant scope | Real pgvector retrieval and knowledge-source negative reads in the same DB fixture | No semantic answer-quality or complete database isolation proof |
| Prompt, structured decision and agent answer | Prompt/provider unit tests; `tests/integration/escalation-baseline.test.ts` runs the real agent with mock AI and a retrieved source | No paid model or live integration response verified |
| Escalation, brand voice and retries | Real DB escalation and scoped prompt-voice reads; unit outbox retry/failure tests | Human ownership and provider-accepted retry defects remain open |

The known-defect suite is an executable future contract: its five intentional
failures must remain separate from normal CI until the corresponding fixes land.

## Script effects and remaining limits

| Command | Effect |
|---|---|
| `pnpm test`, `pnpm test:coverage` | No intended DB writes or provider calls; harness blocks network. |
| `pnpm test:db` | Writes/deletes fixtures in the verified isolated test DB. |
| `pnpm migrate:test`, `pnpm seed:test` | Verify isolation before changing the dedicated test DB. Raw `pnpm migrate` and `pnpm seed` have no equivalent guard. |
| `pnpm test:e2e` | Starts a local web server and uses the isolated test DB. |
| `pnpm eval` | Calls the real inbound path; can write records, invoke a model, and send messages. Never use it as an ordinary safe test. |
| `pnpm channels:encrypt-credentials`, `pnpm outbox:retry`, `pnpm worker` | Mutate database state and may send messages; use only in an explicitly isolated environment. |
| `pnpm staging:preflight` | Reads database/provider configuration and may load local `.env` files over environment variables. |

The baseline does not verify real webhook delivery, provider API permissions,
exactly-once delivery, production backups, or semantic answer quality. No
production data or external account is needed to run the documented tests.
