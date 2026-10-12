# Pronto current architecture

Pronto is one Next.js 16 application backed by PostgreSQL and pgvector, plus
one Node worker process using the same code and database. There is no Redis,
message broker, or separate agent service.

```text
Meta / Telegram / email webhook
  -> Next.js route: authenticate, bind provider account to channel, normalize
  -> inbox transaction: conversation + customer message + inbound_jobs row
  -> 200 acknowledgment

Node worker
  -> claim oldest eligible inbound job per conversation
  -> channel and human-ownership checks
  -> existing agent: guardrails, tenant RAG, brand voice, integration tools
  -> agent message or escalation + persistent outbound_messages row
  -> mark inbound job completed, failed with bounded backoff, or skipped
  -> drain outbound queue through channel adapter
  -> worker_heartbeats row

Operator/client dashboards
  -> operator overview, businesses, inbox, knowledge/connections, operations
  -> four-destination tenant-scoped business portal, handoff and settings
  -> revisioned assistant/channel approval before publication or activation
  -> durable staff notification job for each escalation
  -> local-only authenticated staff proposals and explicit confirmations
```

`src/lib/channels/inbox.ts` commits the customer message and its job atomically.
Provider redelivery returns the same message and job. The worker claims with
`FOR UPDATE SKIP LOCKED`, blocks a later job while an earlier one in the same
conversation is unfinished, and reclaims expired leases up to five attempts.
Agent messages and escalation records are keyed to the customer message; a
worker restart reuses the recorded outcome and outbox idempotency key.

The outbox is persistent but external providers cannot generally promise
exactly-once delivery. A stale `sending` row becomes `uncertain` and requires
manual reconciliation before retry. A successful provider response ID is
stored in outbound metadata when available. WhatsApp delivery webhooks update
that row; they are never passed to the agent.

Human handoff sets the conversation to `escalated`. Later inbound jobs are
stored and skipped while human-owned. AI outbound sends recheck ownership while
holding a conversation row lock. Resolution closes the conversation; an
authorized `release` action restores AI ownership for future messages.

Tranche A retains these workers and adds a five-stage, separately persisted
onboarding workflow, independent business approval capabilities, revision-bound
assistant and channel review, and retriable staff-notification jobs. See the
[managed operations runbook](ops/managed-operations.md) for routes, permissions
and activation gates. The public readiness probe exposes only aggregate status;
operator-only Operations shows queue and worker detail.

Tranche B reuses the same tenant, assistant draft, RAG, approval and escalation
tables. Business correction proposals remain outside active knowledge until
business review, private assistant testing, revision-bound approval and Pronto
publication. The local staff command service reads authenticated business
identity, checks an independent policy capability and stores expiring
confirmation requests in PostgreSQL. No real provider routes feed staff
commands. See [business experience](ops/business-experience.md) for the
portal, role matrix and supported local requests.

## Implemented and externally blocked

- WhatsApp, Instagram and Messenger webhook and send paths have local fixture
  tests and fake Graph transports. Neither account permission nor live
  delivery has been verified in this MVP tranche.
- Instagram supports both the existing **Facebook Login / linked Page** path
  and a separate **Instagram Login / professional account** path. OAuth state,
  encrypted tokens and direct Graph endpoint use have local tests; actual
  permissions and delivery remain an external activation gate.
- Customer support email reuses the same inbox, worker, RAG and outbox. A
  guarded RFC822 injector and loopback Mailpit transport provide the local
  demo; no external mailbox is verified. See [local MVP](demos/local-mvp.md).
- The default Chope connector advertises no API capabilities because no
  authorized endpoint contract or credentials are present. A separate,
  explicitly enabled read-only browser connector can observe demo availability
  under the user's stated Chope permission. It never submits a reservation;
  see [the reader guide](integrations/chope-live-read.md). F&B booking requests
  otherwise receive an operator-verified outlet link or human handoff.
- Shopify, WooCommerce, and delivery adapters remain read-only. Private order
  and tracking lookups are withheld from the agent until customer ownership
  can be verified.
