# Groq-only POC configuration — 26 October 2026

## Verdict

**PASS — Groq-only local POC and genuine external inference verified.** New real conversations default to Groq `openai/gpt-oss-20b`.
`GROQ_API_KEY` is now the sole external AI credential for this path. It does not
require Gemini, OpenAI or another embedding provider, prepared vectors or a new
dependency. Normal PostgreSQL/authentication settings and explicit safety opt-ins
remain required. One approved bounded external Groq generation was performed
with public facts/synthetic content. No paid-plan activation or deployment occurred;
account invoices were not independently inspected.

## Repository and preservation

- Entry: clean `main`, HEAD `8e0c698eb0f815b68fb18e7b3057e7c7da24be81`. Earlier
  Tranche 04 changes had been committed by another process before this request.
- Final worktree: 24 modified tracked files, 1 new report, 0 staged.
  This change does not stage, commit, push, reset, clean or alter Git history.
- Migrations remain through `047_login_throttle.sql`. No migration, schema change,
  vector regeneration, package installation or data conversion was needed.
- Main PostgreSQL (loopback 55433), Mailpit, web and worker were preserved. Only
  web/worker were gracefully restarted to load code, using their existing wrappers.
- Destructive fixture suites use the separately identity-verified disposable DB on
  55434, never the persistent main demo. A separate owned TLS fixture on 55435 was
  used for read-only protected preflight checks. Ports alone never establish safety.
- Existing source approvals, tenant permissions, administrative APIs/CLI, human
  ownership, durable ingestion/outbox and optional provider implementations remain.
  No Jira/Confluence, Meta, Chope or reservation operations were performed.

Final health checks returned 200 for web, health, readiness and Mailpit, with a
fresh worker heartbeat, no pending/processing inbound jobs and zero Gemini vectors.
Only the main services remain running; owned regression/TLS verification clusters
were stopped after testing.

## What changed

`src/lib/llm/demo-models.ts` makes Groq the default/first model choice. A new Groq
session snapshots `provider=groq`, `model=openai/gpt-oss-20b`,
`retrievalMode=local_text`, `embeddingProvider=none`, `embeddingModel=none`.
`customer-demo-ai.ts`, `customer-demo.ts` and the worker carry and validate that
profile. Global embedding/provider overrides cannot turn it into another provider
or introduce a hidden Gemini dependency. Availability checks require only the
Groq key, its Free-tier attestation, explicit approval and approved published text.

The agent reuses `normalizeKnowledgeQuery` and the existing retrieval module's
PostgreSQL full-text machinery: `websearch_to_tsquery('simple', ...)`,
`to_tsvector` and `ts_rank_cd`. The text branch neither calls an embedder nor reads
or ranks vector columns. It creates no embedding usage event. Existing vectors,
including deterministic fixture vectors and optional Gemini vectors, are retained
and unused by this branch; none is presented as a real embedding.

Retrieval joins active published chunks to the same tenant's sources. It accepts
retained business-review evidence from existing publication workflows, or the
exact demo tenant's explicitly curated public-fact sources. The latter are
Pronto-reviewed synthetic POC facts, **not PS.Cafe business approval**. Pending
submissions/drafts, unreviewed legacy sources without retained review evidence,
archived sources and conflict-marked sources are withheld. Approval/publication
APIs and permissions are unchanged.

Retrieved context includes source/chunk IDs, URL/reference, an available matching
source version and current source-content SHA-256. Seed fixtures lacking version
history have null version plus a hash; no version is invented. Trace steps and
generated-message/usage metadata identify `local_text`; cited-source provenance is
retained on the generated message. Customer session and business message/detail
views label local PostgreSQL retrieval separately from real model generation.

Missing matches use the existing low-retrieval-confidence handoff. The existing
known reservation-policy conflict check still escalates before generation, while
the prompt explicitly requires escalation for disagreement or insufficient facts.
Citation validation, post-generation grounding checks, safety triage, provider
timeouts/quota errors and human takeover/release remain authoritative.

## Existing conversations and optional providers

Gemini, OpenAI, Azure, Anthropic and explicit Mock implementations are retained.
Gemini choices show unavailable without Gemini credentials; existing Gemini
conversations do not switch to Groq. Legacy configured-provider regression tests
now select `configured` explicitly, since an omitted new real choice means Groq.

Existing Groq conversations that pinned the former Gemini embedding profile keep
their history/configuration. They fail safely with a start-new-conversation error
instead of silently rewriting provenance or requiring Gemini for the new Groq
flow. Start a new Groq conversation to use local text. No existing records were
bulk rewritten. Model selection remains immutable per conversation.

## Retrieval trade-offs

For three small public demo documents, local text retrieval removes an external
service dependency and its embedding calls. Ranking uses lexical matches and
existing category aliases, so paraphrases, misspellings and multilingual messages
may retrieve less reliably than semantic vectors. Scores are lexical ranks, not
calibrated confidence probabilities. Unreviewed legacy sources are deliberately
excluded until they pass the existing review/publication workflow.

Known flagged conflicts are withheld/detected; unknown semantic contradictions
still depend on the model's escalation contract and existing checks. This change
does not claim universal contradiction detection or production retrieval quality.

## Verification evidence

The focused 39-test run passed before the full suites. Its explicitly stubbed
generation tests verify Groq with Gemini credentials removed, actual isolated SQL
retrieval, immutable worker selection, persisted real-mode/model attribution in
customer/business state, source provenance and **zero embedding calls/events**.
They also verify quota handoff, absent knowledge, known policy conflicts,
cross-tenant exclusion, archive/unreviewed exclusion, and approval/publication
visibility. These tests are not genuine external inference.

| Command/check | Current result |
|---|---|
| `/tmp/pronto-tranche00/test-run pnpm test --maxWorkers=2` | 455 passed, 104 skipped, 0 failed; 559 tests |
| `/tmp/pronto-tranche00/test-run pnpm test:db` | 551 passed, 8 skipped, 0 failed; 559 tests |
| `/tmp/pronto-tranche00/test-run pnpm test:local-mail` | 8 passed, 0 failed |
| `pnpm lint`, `pnpm typecheck` | PASS |
| Guarded production build in `/var/tmp/pronto-groq-app` | PASS (optimized production build) |
| Isolated Playwright regression | 27 passed, 0 skipped, 0 failed (4.3 minutes) |
| Protected production-profile `demo:protected preflight` | PASS using only a synthetic Groq key; Gemini key absent; external sockets blocked |
| Genuine Groq generation | PASS: one recorded external generation, 808 input / 153 output tokens, zero embedding events |

The protected preflight check reused an owned local TLS/marked database and a
deliberately fake key solely to test configuration dependencies. It performs no
inference. No actual account entitlement, quota or billing was established by it.
The eight full-DB skips are the separately opted-in local-mail suite.

The build/browser harness uses a separate source copy and port 3001, with matching
shadow-only network-guard/port references. Main `.next` and its persistent DB are
not used by regression servers. Source/scripts/migrations/tests were byte-compared
apart from the documented shadow port references. Tests block external providers.

## Private activation and genuine acceptance

The private repository `.env` supplied a Groq key and explicit testing/Free-tier
approval flags. Next.js read it, but the separately launched worker did not export
those settings. No repository environment file was overwritten. An owned mode-600
runtime file at `/tmp/pronto-tranche01/real-ai.env` now references only those three
settings using Node's native dotenv parser; it contains no copied key value.
The existing launcher validates the private file and removes the test-only socket
guard only after explicit approval. Both web and worker were gracefully restarted
with the same Groq settings. No Gemini key or other provider key was required.

For future private setup or key rotation, the required provider settings remain:

```text
GROQ_API_KEY
PRONTO_DEMO_REAL_AI_APPROVED=1
PRONTO_GROQ_FREE_TIER_CONFIRMED=1
```

The key is the sole provider credential; the two flags retain spending/testing
authorization and are not credentials or account billing proof. Use the owned
regular mode-600 `/tmp/pronto-tranche01/real-ai.env` file with `export` assignments,
as documented in [the simulator guide](../demos/customer-simulator.md). Do not
overwrite existing settings or put values in shell history, Git or browser code.
Restart both processes with `/tmp/pronto-tranche01/restart-app`.
**There is no Groq embedding-preparation step.**

For a future acceptance rerun, sign in as the authorized PS.Cafe responder, create a new Groq conversation
and ask: “Where is the outlet, and what are its standard opening and closing
hours?” Verify an external Groq response ID, actual model, returned token usage,
approved tenant sources/`local_text` provenance, a delivered real-mode response in
the simulator and the identical persisted answer in the business inbox. Review
takeover/manual reply/release as usual. Booking invitations and Mock/stubbed replies
do not satisfy this gate. Only public restaurant facts and synthetic messages may
be sent. No automatic paid upgrade or alternative-provider retry is authorized.

### Actual live evidence

Command: `/tmp/pronto-tranche01/app-run node /tmp/pronto-groq/live-acceptance.cjs`.
Only one substantive enquiry was sent for external inference:

> What is your address and what are your standard opening and closing hours?

The answer identified 252 North Bridge Road, #03-37, Raffles City Shopping Centre,
Singapore 179103, standard opening 10am/closing 10pm, and last food orders 9pm,
using the existing public location/hours source. Conversation:
`e3668423-5278-4edd-8cbc-722112863407`.

- Actual provider/model: `groq` / `openai/gpt-oss-20b`, provider-validated model
  identity and `generationMode=real`.
- Response ID: `chatcmpl-271be10e-3949-4fb4-8916-8ec74a6a4a46`.
- Returned usage: **808 input tokens, 153 output tokens**; exactly one generation
  usage event and no embedding usage events for this conversation.
- Grounding: source `00000000-0000-4000-8000-00000000a201`, chunk
  `eca99e53-8484-47e8-bb64-04dce103966e`; content hash
  `e4edaf3d042ea843ca0dea865e88ac3e2cb06ecfbd3540d328190da302b5a0eb`.
  Version is null because this historical fixture has no version record.
- The real reply appeared in the simulator and identically in the corresponding
  business inbox/detail, with Groq attribution and local-text retrieval labels.
- Human takeover, a persisted manual reply displayed back to the customer, and
  explicit release passed without generating another model reply.
- Gemini choices returned unavailable/503; they did not switch to Groq. Mock
  stayed independently available. The real browser run had no console/page errors;
  readiness returned 200.

Sanitized evidence: `/tmp/pronto-groq/live-acceptance.json`; screenshots
`/tmp/pronto-groq/screenshots/groq-real-customer.png` and
`groq-real-business.png`, visually inspected. No API key, cookie or unrestricted
prompt is in these artifacts. A preliminary missing-key check stopped when it
found Groq already configured; it created an empty real session and made no
inference call. The final check uses actual provider-returned evidence.

Account Free eligibility was attested in the supplied configuration, not verified
through an account console/invoice. No paid model/plan was activated or automatic
fallback attempted. Token usage and the repository's generic dollar estimates are
not evidence of a zero invoice.

## Local access and deployment blockers

- Customer: <http://localhost:3000/demo/customer>.
- Business: <http://localhost:3000/client/inbox>.
- Mailpit: <http://localhost:8025>; health/readiness under `/api/health` and
  `/api/readiness`. Use the responder identity from the existing fixture guide;
  no passwords are included here. Mock remains usable without credentials.
- `tmux attach -t pronto-local`; logs in `/tmp/pronto-tranche01/logs`.
  `/tmp/pronto-tranche01/restart-app` restarts only web/worker. The existing
  `/tmp/pronto-local/stop-services` targets the owned stack if stopping is later
  requested; it is not run at task completion.

The [Vercel runbook](../setup/vercel-demo.md) and protected environment template
now require Groq only for this POC. Hosting/budget approval, account-side billing review, hosted secret provisioning,
protected invitations, managed DB/network
policy, worker restart and cloud backup/restore acceptance remain outstanding.
No cloud deployment or paid plan was activated. PRON-86's local real-AI gate is now satisfied by the substantive grounded Groq
round trip; dual-provider acceptance is no longer the current product requirement.
This is a closure recommendation, not a Jira status change.
PRON-88 remains unaccepted until an approved deployment is verified. No Jira status
was changed.

## ChatGPT handover

Pronto's current POC defaults to Groq `openai/gpt-oss-20b` and needs only
`GROQ_API_KEY` as its external AI credential, plus explicit testing/Free-tier
attestation flags and existing database/auth settings. The agent uses tenant-scoped
approved published PostgreSQL text/full-text retrieval, with no embedding calls,
no vector preparation and no new dependencies or migrations. Source IDs, available
versions and content hashes accompany local-retrieval traces/messages. Existing
vectors and optional Gemini/OpenAI/Azure/Anthropic/Mock implementations survive.
Existing conversations never silently change provider; old Groq/Gemini-embedding
snapshots need a new Groq conversation for the new retrieval profile.

Local text ranking sacrifices semantic/paraphrase/multilingual recall. Missing
facts and known conflicts fail safely through existing handoff rules; unknown
semantic conflicts still rely on the model/checks. Deterministic tests prove the
Groq-only configuration and persisted worker/customer/business path, and genuine
external Groq acceptance now passed with the supplied private key/approval: one
808-input/153-output-token generation, identical answer in both views and successful
takeover/manual reply/release, with zero embedding events.
Do not claim paid usage was impossible or that an account invoice was checked.
Nothing was deployed; protected hosting and recovery approval/acceptance remain.
