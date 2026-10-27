# Agent behavior and quality checks

Apply migrations through **054_agent_processing_recovery.sql** before updating
web or worker processes. The migration adds inbound-job failure codes and a
shared tenant/provider cooldown table. It does not change customer ownership or
published knowledge. Existing `provider_error` escalations retain their existing
staff ownership until an authorized release; new provider failures create no
escalation, staff notification or knowledge-review task.

## Evidence and conversational retrieval

The post-generation gate validates supported numeric clock formats, prices,
calendar dates and exact HTTPS URLs against **cited evidence actually included
in the packed prompt**. Opening and closing roles and simple price subjects are
checked separately. A source saying 10pm cannot support an answer saying 11pm;
a coffee price cannot be borrowed from the cake price. Customer-supplied values
may be repeated in a clarification question or explicitly attributed request,
not promoted into business facts. A source without a year cannot authorize an invented year; malformed clock values and unnamed amounts with multiple possible prices fail closed. Customer-supplied links never authorize a
business booking link. The gate runs before storing or queuing the answer.

This is targeted deterministic validation, not general semantic entailment.
Spelled-out amounts, complex product modifiers, exceptions by weekday, arbitrary
languages and all nonnumeric policy claims are not completely verified. Source
approval, model instructions, citation checks and the remaining overlap check
still matter. Low-overlap paraphrases and ambiguous subject wording can cause
conservative handoffs. A compromised approved source remains a source-integrity
problem; escaping its markup and instructing the model to ignore embedded
commands does not prove general prompt-injection resistance.

Recent context is anchored to the current customer message's durable inbox
sequence, scoped to tenant and conversation. Later queued messages cannot
influence the earlier reply, even when timestamps tie or are inverted. Earlier
agent replies are included by their originating job. Legacy messages without
origin metadata need a strictly earlier timestamp. Follow-up queries use up to
two recent customer turns; explicit topic changes use the new topic. A
substantive retrieval miss hands off as a knowledge gap. Business-name context
is allowed for a greeting/AI disclosure only, labelled `identity_fallback` in
the trace and excluded as evidence for a substantive missing fact.

Prompt packing counts the final system/user envelope, escaping and a schema
reserve. It removes whole examples, lower-ranked source chunks and oldest
history before shortening style text. Required policy and the current request
are retained; an oversized required prompt stops as an operational limit.
Citation validation uses only the surviving source IDs. Prompt hash and token
estimate reflect that packed envelope. Token counts are estimates, not a
provider-specific tokenizer guarantee; provider-reported usage replaces the
reservation when available.

## One budget per inbound turn

The worker, engine, reservation extractor, answer and optional handoff intake
share an async-local budget. Nested scopes join the same tenant/turn.

| Variable | Default | Bound |
| --- | ---: | --- |
| `PRONTO_AGENT_TURN_TIMEOUT_MS` | 45000 | 1000–90000 ms |
| `PRONTO_AGENT_TURN_MAX_CALLS` | 3 | 1–6 model calls |
| `PRONTO_AGENT_TURN_MAX_TOKENS` | 12000 | 1000–64000 estimated input + reserved output tokens |

Existing per-call `PRONTO_AGENT_TIMEOUT_MS`, output and prompt limits still
apply, capped by the remaining turn deadline. SDK automatic retries are
disabled; retries happen as durable jobs. Deadline cancellation propagates to
model requests, HTTP integration tools and scoped browser reads. Late model and
tool results cannot be saved or delivered. Budget failures stop the job rather
than repeating the same oversized work. Trace steps record stage reservations,
reported token usage, calls and elapsed time. Reasoning tokens are already part
of output usage and are not added twice. Integration reads share the deadline;
the call count counts model/embedding calls, not each read-only HTTP request.

A primary decision that needs staff may contain a safe acknowledgement. The
same factual/policy gate validates it (critical handoffs cannot ask questions),
and it is saved atomically with the escalation. The worker/recovery path reuses
that message and outbox identity, avoiding another retrieval/model call. An
unusable or absent primary acknowledgement uses optional bounded intake; intake
failure cannot undo a valid business handoff.

## Operational recovery

Rate limits, timeouts and network/5xx failures remain recoverable processing
errors. The inbox retries up to five actual attempts with 5/10/20/40-second
backoff and honors sanitized `Retry-After` values up to one hour. A PostgreSQL
cooldown keyed by tenant/provider is checked before further calls across
workers. Waiting behind another turn's cooldown does not spend a provider
attempt; a job deferred for 15 minutes stops rather than waiting forever.
Cooldown checks reduce repeated traffic; they do not serialize already-running
requests or replace the provider's account-wide limiter.

Explicit exhausted-quota/billing codes, authentication, configuration, malformed
provider responses and prompt/turn-budget failures stop immediately. A plain
HTTP 429 is a rate limit unless the provider supplies an explicit exhausted
quota code. Providers that return only a generic daily rate limit stop after
the bounded retry policy. Error records retain safe codes, provider name and
retry time, not raw provider bodies or credentials. No provider/model fallback
or mock response is used. The customer simulator shows recovery, quota and
configuration states; a stopped job can be manually retried through its existing
audited, rate-limited control after the cause is fixed. Active cooldowns still
apply to manual retries. Conversation ownership stays active for operational
failures; later jobs remain behind the failed job to preserve ordering.

## Repeatable quality evaluation

Use a **disposable** PostgreSQL 16/pgvector database named `pronto_test`, exposed
on an explicit loopback port and marked with `pnpm test:db:mark`. The local
customer-simulator guard also requires the server connection to terminate on
loopback; with Docker, use a loopback listener/relay inside its network namespace.
Set `DATABASE_URL` and `PRONTO_TEST_DATABASE_URL` to the same URL, then run:

```sh
pnpm migrate:test
pnpm eval
```

The evaluator verifies the isolated database before touching fixtures. It
removes/recreates the synthetic PS.Cafe tenant for each scenario, so do not use
an actively demonstrated test database. External sockets/fetch are blocked by
the test harness. Fake keys and canned HTTP responses exercise the **real**
Groq SDK adapter, execution profile, worker, retrieval, tools, checks, database
persistence and local console delivery. No real model, email, Meta send, browser
read or staff-notification transport is called. The old email-based routing
runner has been replaced; `EVAL_FILE`/`EVAL_CLIENT_SLUG` are no longer controls.

`evals/agent-answer-quality.json` contains 30 scenarios: correct/incorrect
hours, prices, dates and links; follow-ups and topic changes; booking
corrections and tool arguments; unknown/disputed policies; customer/source/history
injection attempts; future-message isolation; operational failures; tool errors;
handoff acknowledgement reuse and human ownership. Grading independently checks
required/forbidden answer content, actual outcome/reason, citations, budgets,
ownership and queued text. Separate assertions cover tool arguments and actual
delivery. Unit tests prove the grader fails wrong facts even with valid routing
and citations.

CI runs the evaluator in PostgreSQL’s network namespace so both ends of the local database connection use loopback, retaining the existing simulator guard. The `test:db` script also uses the fixture/CI `localhost` origin consistently.

Reports are written to ignored `output/agent-quality/vitest.json` and
`manifest.json` with the Git revision, corpus version, provider/model, mode and
exit code. Fixture passes establish software behavior against controlled
responses; they do **not** measure a live model's factual accuracy, multilingual
reasoning or injection robustness. Capture reviewed real-model outputs as new
fixtures when available, and separately run a bounded live synthetic acceptance
walkthrough before a demonstration. This evaluator never silently calls a live
provider.
