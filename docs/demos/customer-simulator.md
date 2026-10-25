# Connected customer simulator

This is an authenticated, development-only simulated Instagram DM for the
**unofficial PS.Cafe Raffles City demo**. It uses the existing PostgreSQL inbox,
worker, agent/RAG and outbox. It never uses PS.Cafe's Instagram account.

## Local setup

Follow [the database identity safeguards](../testing/safe-regression-baseline.md)
and [the PS.Cafe fixture guide](ps-cafe-raffles-city.md) first. The simulator
requires the explicitly marked loopback `pronto_test` database, matching
`DATABASE_URL` and `PRONTO_TEST_DATABASE_URL`, and the existing demo tenant.
Neither a familiar port nor a database name alone establishes disposal safety.
Never run fixture removal, seeds or regression suites against a database whose
existing conversations you want to preserve.

With the verified development database and existing auth/encryption settings:

```sh
pnpm migrate:test
PRONTO_CUSTOMER_DEMO_ENABLED=1 pnpm demo:customer:setup
PRONTO_CUSTOMER_DEMO_ENABLED=1 PRONTO_DEMO_ONLY_DELIVERY=1 pnpm dev
# In a separate persistent terminal, with the same environment:
PRONTO_CUSTOMER_DEMO_ENABLED=1 pnpm demo:customer:worker
```

Setup adds only the dedicated `console` simulator channel; it does not activate
Meta channels or replace the demo tenant. The dedicated worker also sets
`PRONTO_DEMO_ONLY_DELIVERY=1`, blocking all provider delivery except this synthetic
transport and existing local SMTP. Keep that flag on the web process too because
existing authorized human-reply routes can dispatch immediately.

Sign in as the PS.Cafe demo responder from the fixture guide. Open
`http://localhost:3000/demo/customer` and `http://localhost:3000/client/inbox`
in separate tabs. Use the same authenticated responder for this local walkthrough.
Each simulator history belongs to its initiating user; authorized business staff
see tenant conversations through the existing business inbox.

**Open business inbox** targets `/client/inbox`. An operator account receives
account-switching instructions rather than a business role or a redirect to the
retired HQ dashboard. Use **Sign out and switch account**, then the PS.Cafe
responder documented in the fixture guide. Sign-in returns to the inbox. Tabs in
one browser profile share cookies; use a separate profile/private window to keep
an operator session independent. Administration now uses the
[authenticated CLI](../ops/operator-cli.md).

The inbox loading screen explains delays and offers plain reload/sign-in links
from the initial streamed HTML, before hydration. Once hydrated, ten/forty-second
timers strengthen that guidance. A database failure has a dedicated retry screen
using Next.js 16.4's server-content-refetching `retry()` API. The current
database pool already limits connection waits to five seconds and statements to
thirty seconds. A skeleton alone is not evidence that the inbox has loaded.

Choose **Mock • deterministic test** explicitly to exercise the pipeline without
provider credentials. Ask “What time do you close today?” for a grounded fixture
answer. Start another conversation and ask “My order has a missing item and I
want a refund” for a policy handoff. The business view supports independent owner
review, urgency, takeover, manual reply/resolution and explicit release. AI does
not answer a human-owned backlog after release; future enquiries can use AI again.

The default **Real AI** selection fails clearly if credentials or real knowledge
embeddings are absent. It does not substitute mock generation. Deterministic
policy replies, booking invitations and escalation acknowledgements can still
precede model generation; these are not evidence of external inference.

## Configure genuine development inference securely

Use a private file outside Git with mode `600`, or securely provision environment
variables in both the web and worker launch environments. Do not paste keys into
chat, source files, shell history, command arguments or test logs. Do not overwrite
an existing environment file. The existing provider adapters are reused:

| Provider | Required configuration |
|---|---|
| OpenAI generation and embeddings | `OPENAI_API_KEY`, `PRONTO_LLM_PROVIDER=openai`, `PRONTO_EMBEDDING_PROVIDER=openai`; optionally `OPENAI_RESPONSE_MODEL` and `PRONTO_EMBEDDING_MODEL` |
| Azure OpenAI | `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `PRONTO_LLM_PROVIDER=azure`, `PRONTO_EMBEDDING_PROVIDER=azure`, `AZURE_OPENAI_RESPONSE_DEPLOYMENT` (or `AZURE_OPENAI_DEPLOYMENT`), `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` |
| Anthropic generation | `ANTHROPIC_API_KEY`, `PRONTO_LLM_PROVIDER=anthropic`, optionally `ANTHROPIC_RESPONSE_MODEL`; separately configure OpenAI or Azure embeddings |

The demo config currently selects OpenAI `gpt-5.5` with
`text-embedding-3-small`; these are repository defaults, not a claim that your
account has access. Model access, costs and suitable processing terms must be
checked for the chosen development account. Tests continue using mock mode.

Seed vectors are deterministic test data. After configuring the genuine provider,
prepare real vectors for the demo's current published knowledge:

```sh
PRONTO_CUSTOMER_DEMO_ENABLED=1 PRONTO_DEMO_REAL_AI_APPROVED=1 pnpm demo:customer:embed
```

This explicit opt-in can incur provider charges. It updates only current demo
chunks' vectors and embedding provenance, preserves content/approval boundaries,
and records an audit event. Real-mode retrieval requires matching provider/model
provenance and tenant scope. Changing embedding providers/models requires
preparation again. Archived knowledge does not establish readiness.

Restart the web and worker with those same provider settings. A test-only
`NODE_OPTIONS=--import=./tests/setup/network-guard.mjs` rejects external sockets;
it must not be inherited by an explicitly enabled real-provider demonstration.
Keep test commands guarded, external-channel delivery disabled and both
`PRONTO_CHOPE_LIVE_READS` and `CHOPE_LIVE_READ_APPROVED` off. No additional Chope
read or booking-link behavior is authorized by this setup.

Select Real AI, create a new session and ask a substantive knowledge question.
Verify a delivered reply marked **real model response** plus a successful provider
generation event and the matching tenant RAG evidence. A configuration indicator,
policy response or stubbed provider test alone is not genuine inference acceptance.
Provider errors hand off to staff; credentials disappearing before worker execution
leave the durable job to retry/fail clearly rather than switching modes.

## Triage scope and tests

The persisted labels are independent AI response and owner-action decisions, plus
short-term/long-term urgency. Existing urgent/negative-sentiment handoffs initially
map to short-term; other new outcomes map to long-term. Staff can review urgency
and owner action. This is an initial presentation of existing policies, not a new
semantic urgency classifier. Historical labels remain unknown until processed.
The existing per-business response target, timezone, staffed hours and reminder
machinery remain authoritative; no new SLA duration or per-urgency scheduler is
introduced. Resolving a handoff still requires a separate authorized release.

Run ordinary unit tests with `pnpm test`. Use a separate identity-verified marked
database for `pnpm test:db` and `pnpm test:local-mail`. The new browser scenarios
are opt-in with `PRONTO_CUSTOMER_DEMO_ENABLED=1 PRONTO_DEMO_ONLY_DELIVERY=1 pnpm
test:e2e:local-mail`; they launch an owned worker and exercise mock generation,
real-mode configuration failure, shared state, takeover, manual reply and release.
They do not establish genuine LLM or live Instagram acceptance. The simulator
remains disabled under `NODE_ENV=production`; protected hosted demo access belongs
to a later tranche.
