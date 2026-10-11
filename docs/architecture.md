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
  -> tenant-scoped conversations, handoff, knowledge, settings
  -> operator view of exhausted inbound and uncertain outbound work
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

## Implemented and externally blocked

- WhatsApp and Instagram webhook and send paths have local fixture tests and
  fake Graph transports. Neither account permission nor live delivery has
  been verified.
- Instagram uses the manually provisioned **Facebook Login / linked Page**
  path and a Page access token. It does not implement Instagram Login OAuth.
- The default Chope connector advertises no API capabilities because no
  authorized endpoint contract or credentials are present. A separate,
  explicitly enabled read-only browser connector can observe demo availability
  under the user's stated Chope permission. It never submits a reservation;
  see [the reader guide](integrations/chope-live-read.md). F&B booking requests
  otherwise receive an operator-verified outlet link or human handoff.
- Shopify, WooCommerce, and delivery adapters remain read-only. Private order
  and tracking lookups are withheld from the agent until customer ownership
  can be verified.
