# Connected customer simulator

This is an authenticated simulated Instagram DM for the
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

The default **Gemini 3.8 Flash** selection fails clearly if credentials, free-tier
attestation, explicit testing approval or real knowledge embeddings are absent. It does not substitute mock generation. Deterministic
policy replies, booking invitations and escalation acknowledgements can still
precede model generation; these are not evidence of external inference.

## Configure genuine development inference securely

Use a private file outside Git with mode `600`, or securely provision environment
variables in both the web and worker launch environments. Do not paste keys into
chat, source files, shell history, command arguments or test logs. Do not overwrite
an existing environment file. The existing LLM abstraction is reused; OpenAI, Azure, Anthropic and Mock remain
available through **Configured real AI** or Mock. New conversation choices pin a
server-side allowlisted provider/model/embedding profile. Changing the selector
does not rewrite an existing conversation. No arbitrary model or endpoint is
accepted from the browser:

| New choice | Generation | Shared retrieval |
|---|---|---|
| Gemini 3.8 Flash (default) | `gemini` / `gemini-3.8-flash` | Gemini Embedding 2 |
| Groq GPT-OSS 20B | `groq` / `openai/gpt-oss-20b` | Gemini Embedding 2 |
| Gemini 3.5 Flash-Lite | `gemini` / `gemini-3.5-flash-lite` | Gemini Embedding 2 |
| Mock | Existing deterministic adapter | Existing fixture vectors |

For free-provider mode, securely configure **both web and worker**:
`GEMINI_API_KEY`, `GROQ_API_KEY`, `PRONTO_DEMO_REAL_AI_APPROVED=1`,
`PRONTO_GEMINI_FREE_TIER_CONFIRMED=1`, `PRONTO_GROQ_FREE_TIER_CONFIRMED=1`. The
confirmation flags must follow checking each account's free entitlement, model
access, active limits, billing status and permitted user regions. They cannot
verify billing automatically. Do not set them for a paid-only account/model.
Groq generation also requires the Gemini key and prepared Gemini vectors for RAG.
Only the exact synthetic PS.Cafe tenant is eligible for these new free adapters.

Google's unpaid-service terms permit improvement/human review of submitted data;
use only public outlet facts and synthetic messages, never personal, confidential
or sensitive information. Clients available to users in the EEA/UK/Switzerland
require Google's Paid Services under its terms; review user-region eligibility
before inviting Keith. Groq retains usage metadata and has abuse/reliability
retention exceptions; account Data Controls/ZDR were not inspected. See
[Google terms](https://ai.google.dev/gemini-api/terms),
[Google pricing](https://ai.google.dev/gemini-api/docs/pricing),
[Groq data handling](https://console.groq.com/docs/your-data) and
[Groq limits](https://console.groq.com/docs/rate-limits). An accessible API key is
not proof of free billing. No free quota or zero bill is promised.

Legacy configuration remains:

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
prepare real vectors for the demo's current published knowledge. For the new
Gemini/Groq choices, use:

```sh
pnpm demo:customer:embed --provider gemini
```

This requires the above explicit approvals and Gemini key. It sends individual
bounded `embedContent` requests (not the paid Batch API), using
`gemini-embedding-2` with 1536 dimensions, document and question-answering query
prefixes from its supported API. Embedding 2 does **not** accept `task_type`. A
separate `customer_demo_embeddings` HNSW index records model/provider, QA profile
and SHA-256 source-content hash. Stale, archived, unpublished and cross-tenant
chunks are excluded. Original Mock/OpenAI vectors are preserved, never mixed with
Gemini vectors. Groq uses this same Gemini index. All current published demo chunks
must be prepared before creating a new free-provider real conversation.

For the legacy OpenAI/Azure embedding procedure:

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

Select a configured Gemini/Groq choice, create a new session and ask a substantive
knowledge question. Independently repeat the same question in another provider
conversation. For example: “Where is this outlet, what time does it close today,
and should I assume there is a last-order cutoff?” The safe response must use
approved outlet facts and preserve uncertainty about unpublished details.
Verify a delivered reply marked **real model response** plus a successful provider
generation event and the matching tenant RAG evidence. A configuration indicator,
policy response or stubbed provider test alone is not genuine inference acceptance.
Selected provider/model and actual `real`, `mock`, deterministic-policy or human
mode are shown separately in customer/business views. Provider response IDs and
token usage are retained where returned. Quota errors surface explicitly and hand
off; choose another provider in a **new conversation** to try it intentionally.
There is no automatic alternative, paid upgrade, SDK retry or mock substitution.
Generation has a 25-second default timeout and bounded output.
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
They do not establish genuine LLM or live Instagram acceptance. Ordinary production still disables the simulator. The separate, fail-closed
`protected-demo` profile now supports invited synthetic users and a uniquely marked
non-test database. See [Vercel setup](../setup/vercel-demo.md); no hosted resources
have been provisioned. Hosted delivery excludes even local SMTP. Local demo
databases must never be used as hosted regression targets.


## Existing WSL stack: secure local activation

The current owned stack uses `pronto-local` tmux windows `postgres`, `mailpit`,
`web`, `worker`; customer/inbox port 3000 and Mailpit 8025. The responder identity
is in the fixture guide. Both web and worker currently have no Gemini/Groq key.
Select Mock for a working walkthrough.

If using this session's wrappers, edit (do not overwrite) the optional private file
`/tmp/pronto-tranche01/real-ai.env`, outside the repository. Create it with a private
editor under `umask 077` only if absent; require owner-only mode `600`. Put `export`
assignments for the five free-provider variables listed above in that file, keeping
keys out of shell history/chat. Do not copy credentials into this guide. The
launcher refuses unsafe file ownership/type/mode and only removes the test-only
network guard when the explicit real-AI approval is present.

After verifying account eligibility and authorizing the bounded external test:

```sh
/tmp/pronto-tranche01/app-run pnpm demo:customer:embed --provider gemini
/tmp/pronto-tranche01/restart-app
```

The second command gracefully restarts only web/worker with the same optional
private settings; PostgreSQL/Mailpit remain intact. These `/tmp` wrappers are local
session artifacts. Do not seed/reset the persistent demo database to enable AI.
Missing credentials/approval remain an explicit configuration error, independent
of Mock. Actual external generation still needs account-side and browser acceptance.
