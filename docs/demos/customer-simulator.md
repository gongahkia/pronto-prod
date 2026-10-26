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

Open **Model settings** to select Groq or either Gemini model. Unavailable models
remain visible but disabled; availability is checked on the server in both local
and hosted environments. **New conversation** is disabled until an available
model is selected. Mock and the generic configured-provider choice are absent
from the dropdown and rejected by the customer API. Legacy mock sessions cannot receive new messages outside the automated test harness.
Ask “What time do you close today?” for a grounded outlet answer.
Switch views by entering `/demo/customer` or `/client/inbox` directly; neither view includes a switch link. Both display the same persisted conversation. Inbox refreshes automatically while visible.
Start another conversation and ask “My order has a missing item and I
want a refund” for a policy handoff. The business view supports independent owner
review, urgency, takeover, manual reply/resolution and explicit release. AI does
not answer a human-owned backlog after release; future enquiries can use AI again.

The default **Groq GPT-OSS 20B** selection is disabled if its key, free-tier
attestation, explicit testing approval or approved published knowledge are absent.
It needs no embedding service or embedding preparation. It does not substitute mock generation. With real inference enabled, greetings, booking answers and handoff acknowledgements also require a real model call. Failed generation hands the conversation to staff without saving a canned customer reply.

The legacy seeded/mock history was archived and removed from the local PS.Cafe tenant. Genuine model conversations remain available in both views. A further predeployment history reset must remain scoped to this simulator's conversations and their dependent messages/jobs; retain the tenant, accounts, approved knowledge and provider configuration.

For routine complaints and transactional enquiries, the real model can write a
source-grounded handoff acknowledgement with a relevant follow-up question. It
receives the business context and recent messages, so it can ask for useful missing
details without repeating information already supplied. The question is generated,
not selected from a fixed order script. Staff retain ownership after handoff and
subsequent customer details stay in the same thread. Missing knowledge, a model
failure or a failed grounding check leaves the reply to staff without storing a canned acknowledgement.

The workspace and customer chat use the logo from [PS.Cafe's official website](https://www.pscafe.com/),
stored locally at `public/brands/ps-cafe-logo.webp`.

The conversation's **Decision flow** tab shows the recorded path for each customer message. Routine business triage reaches the real model using approved knowledge and the business handoff configuration. Security, private-record access and critical-issue checks remain in place. Model explanations are recorded from the provider's structured decision; older traces without an explanation are marked accordingly. Follow-ups received during staff ownership show the paused path rather than an invented model decision.

Retrieved documents appear as connected source cards with document names, excerpts, original links and a distinction between retrieved context and citations actually used. New traces retain source snapshots; older traces resolve their recorded chunk IDs against the remaining knowledge records. Model nodes show the recorded provider and model. In Inbox, delivered assistant answers and completed staff conversations are dimmed with a green tick. This completes the current enquiry without preventing future customer messages in an assistant-owned chat.

## Configure the current Groq-only POC securely

Groq `openai/gpt-oss-20b` is the default for new real conversations. The only
external AI credential required is **`GROQ_API_KEY`**. Normal database/authentication
settings still apply. Keep these safety opt-ins in both web and worker:

```text
PRONTO_DEMO_REAL_AI_APPROVED=1
PRONTO_GROQ_FREE_TIER_CONFIRMED=1
```

The confirmation flag follows checking Groq Console's actual Free entitlement,
model permissions, active quotas and billing. It is an operator attestation, not
an API billing check. No paid upgrade, provider fallback or implicit Mock occurs.
Use only public outlet information and synthetic messages. Groq's usage metadata
and abuse/reliability retention exceptions still apply; see
[its data policy](https://console.groq.com/docs/your-data).

Keys must stay server-side, outside Git in an owned regular file with mode `600`.
Never paste them in chat, command arguments, shell history or browser code. The
existing WSL launcher supports `/tmp/pronto-tranche01/real-ai.env`. Edit it privately
(do not overwrite existing settings), using `export` assignments for the Groq key
and the two opt-ins above. Create it under `umask 077` only if absent. The launcher
refuses unsafe ownership/type/mode and removes the test network guard only with
explicit approval. Do not put test/provider secrets in repository documentation.

After privately configuring the key and approving the bounded test, restart both
processes with the same environment:

```sh
/tmp/pronto-tranche01/restart-app
```

**Do not run an embedding command for Groq.** No Gemini/OpenAI/Azure/Anthropic key,
new dependency or schema migration is required. The defaults in `.env.example`
for ordinary configured providers do not override a Groq conversation snapshot.
If an earlier Groq conversation pinned Gemini embeddings, its history remains
readable but new processing fails with a start-new-conversation explanation rather
than silently rewriting its profile. Create a new Groq conversation. Existing
Gemini conversations remain Gemini and fail clearly while their key is absent.

## Local text retrieval, provenance and limitations

Groq uses the existing normalized query/category aliases with PostgreSQL
`websearch_to_tsquery('simple', ...)`, `to_tsvector` and `ts_rank_cd`, against
**published knowledge chunks** joined to their tenant's active sources. It does
not generate, inspect or rank embedding vectors. Original stored vectors and the
optional Gemini index are preserved and unused by this path.

Sources must have retained business-review evidence from the existing approval/
publication workflow, or be this exact synthetic tenant's curated public-fact
fixtures. The latter are Pronto-reviewed demonstration information, **not PS.Cafe
business approval**. Pending proposals/drafts, unreviewed legacy sources without
review evidence, archived sources and conflict-marked sources are excluded. No
new permission, publication or approval shortcut is introduced.

Retrieved context retains chunk/source IDs, source URL/reference, available source
version and current source-content hash. Seed fixtures with no version history
are labelled with a hash and null version, not an invented version. Trace steps
record `local_text` and zero embedding calls; generated messages and usage records
retain that retrieval mode alongside actual Groq model/provider/response evidence.
Both chat views show customer-facing text and sender labels. Model/provider diagnostics remain in database metadata, traces and usage records for verification; the business inbox does not display them.

Keyword search is less robust than semantic vectors for paraphrases, spelling
errors and languages outside existing aliases. Its score is lexical ranking, not
a calibrated probability. Missing matches use the existing low-confidence handoff.
Known flagged reservation policy conflicts hand off before generation; prompts
also require escalation for conflicting or insufficient supplied facts, followed
by existing citation/grounding/safety checks. This does not claim a universal
semantic contradiction detector. For the small English-language synthetic fixture,
local text retrieval avoids another external service while remaining auditable.

## Genuine inference acceptance

Sign in as the authorized responder, choose Groq and create a **new** conversation.
Ask one substantive public-fact enquiry, for example:

> Where is the outlet, and what are its standard opening and closing hours?

Require an actual Groq-generated answer using retrieved fixture facts, delivered
`real`/`groq`/`openai/gpt-oss-20b` message metadata, provider response ID/token usage,
source provenance and the **same persisted response** in the business inbox.
Verify takeover, a human reply and explicit release using the existing controls.
Do not treat a deterministic booking invitation, Mock answer or stubbed test as
external acceptance. Provider quota exhaustion remains visible and hands off;
there is no automatic alternative. A new explicitly selected conversation is
required to use another provider.

## Optional future providers (preserved)

Gemini choices remain available in the selector but are unavailable without
`GEMINI_API_KEY`, the separate free-tier attestation/testing opt-in and prepared
Gemini Embedding 2 vectors. Their existing adapter, separate 1536-dimensional QA
index and `demo:customer:embed --provider gemini` procedure are retained. Do not
run that procedure for the current Groq-only POC or silently substitute Groq into
an existing Gemini conversation.

The backend retains optional OpenAI generation/embeddings
(`OPENAI_API_KEY`), Azure deployment configuration, or Anthropic generation with
separately configured OpenAI/Azure embeddings. These optional modes can incur
charges and require their own account/processing approval. Their implementation
and provenance checks have not been deleted. These generic configured modes are absent from the customer dropdown. Mock generation is limited to explicit internal test harnesses.

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
test:e2e:local-mail`; they launch an owned worker and check configuration failure, disabled choices and mock-request rejection. The real conversation workflow additionally requires `PRONTO_RUN_REAL_DEMO_E2E=1` and an approved configured provider. Stubbed tests do not establish genuine LLM or live Instagram acceptance. Ordinary production still disables the simulator. The separate, fail-closed
`protected-demo` profile now supports invited synthetic users and a uniquely marked
non-test database. See [Vercel setup](../setup/vercel-demo.md); no hosted resources
have been provisioned. Hosted delivery excludes even local SMTP. Local demo
databases must never be used as hosted regression targets.


## Existing local services

`pronto-local` tmux windows `postgres`, `mailpit`, `web`, `worker` remain the owned
stack. Customer/inbox use port 3000; Mailpit uses 8025. Logs are under
`/tmp/pronto-tranche01/logs`. Groq is now configured and one genuine local round trip passed; Mock remains
available independently. The private runtime reference reads the existing `.env`
settings without storing a second key value. Do not seed/reset the persistent database to enable AI.
The wrappers under `/tmp` are local session artifacts, not deployment machinery.
