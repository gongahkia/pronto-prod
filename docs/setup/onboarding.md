# Engineer Onboarding

Target: a second engineer is productive on the templated core in under two weeks.

## Day 1 — Environment

1. Install Node.js 20+, pnpm, Docker.
2. Clone the repo, then run `pnpm install`.
3. `cp .env.example .env`. Leave `PRONTO_USE_MOCK_AI=1` for local work.
4. `docker compose up -d` (Postgres 16 with pgvector on port 55432).
5. `pnpm migrate && pnpm seed`.
6. `pnpm dev`. Visit `http://127.0.0.1:3000`.
7. Log in as operator and client with the seeded credentials in `README.md`.

## Day 2 — Read These In Order

1. `docs/architecture.md` — high-level request flow.
2. `db/migrations/001_initial.sql` — the canonical schema. Every other migration is a delta.
3. `src/lib/channels/process.ts` — the inbound message pipeline.
4. `src/lib/agent/engine.ts` — the LLM generation + escalation decision loop.
5. `src/lib/knowledge/query.ts` — retrieval + citation enforcement.
6. `src/lib/agent/guardrails.ts` — pre-generation and post-generation guards.
7. `src/lib/channels/outbox.ts` — outbound delivery with retry/idempotency.
8. `src/lib/reporting.ts` — operator command center + dashboards.

## Module Map

| Concern | Entry point |
|---|---|
| Templated core prompt | `src/lib/agent/engine.ts`, `src/lib/brand-voice.ts` |
| RAG | `src/lib/knowledge/*` |
| Guardrails | `src/lib/agent/guardrails.ts`, `src/lib/agent/self-check.ts` |
| Channels | `src/lib/channels/whatsapp.ts`, `telegram.ts`, `messenger.ts`, `instagram.ts`, `email.ts`, `process.ts`, `dispatch.ts`, `outbox.ts` |
| Escalations | `src/lib/escalations.ts`, `src/app/api/escalations/*` |
| Triage flows | `src/lib/triage-flow.ts`, `triage-flow-store.ts` |
| Dashboard | `src/lib/reporting.ts`, `src/app/operator/*`, `src/app/client/*` |
| LLM providers | `src/lib/llm/openai.ts`, `anthropic.ts`, `mock.ts`, `index.ts` |
| Error tracking | `src/lib/error-tracking.ts` |

## Conventions

- Server-side code lives under `src/lib`. Routes under `src/app/api`. Server components under `src/app/{operator,client}`.
- Database access goes through `query` / `transaction` from `src/lib/db.ts`. Do not open new pools.
- All writes that touch customer-facing systems (channels, outbound) must be idempotent. The outbox is the reference pattern.
- Audit-critical operations call `recordAuditLog` from `src/lib/audit.ts`.
- Errors that need ops attention call `recordErrorEvent` from `src/lib/error-tracking.ts` in addition to `logWarn`/`logError`.
- Tests use Vitest with jsdom. Place unit tests in `tests/unit/<feature>.test.ts`. Mock the DB pool by mocking `@/lib/db`.

## Daily Loop

Before pushing:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

If you added a migration, also run `pnpm migrate` against the local Postgres before re-seeding or starting the app.

## Where Things Get Tricky

- **Webhook idempotency.** Meta and Telegram retry on 5xx. `processWebhookBatch` deduplicates by `(channel_id, external_message_id)` so handlers must be safe to replay.
- **Outbound retries.** `flushOutboundMessage` claims a row with a stale-sending window. Tests must not assert exact query counts without accounting for the claim + update pair.
- **LLM provider boundary.** Provider adapters implement the `LlmProvider` interface. Don't import provider SDKs outside `src/lib/llm/*`.
- **Guardrails.** Pre-generation guardrails read from `agent_configs.escalation_rules`. New topics must be added to both the rules and the topic enum in `src/lib/agent/guardrails.ts`.
- **PDPA-sensitive logs.** `src/lib/logger.ts` redacts phone numbers, bearer tokens, and `body|content|message|payload|raw|text` keys. Avoid logging full customer messages.

## Two-Week Targets

- Week 1: ship a documentation PR (typo fix, comment improvement, or doc clarification) end-to-end.
- Week 1 end: complete one full request trace from webhook to outbound on paper, with file:line references.
- Week 2 mid: own a small bug fix that touches the agent pipeline plus a test.
- Week 2 end: ship a new escalation guardrail or a small dashboard improvement under review.

## Escalation Paths

- Architecture / scope decisions: Gabriel.
- Legal / compliance / contracts: Keith.
- Pricing / GTM: Astin.
- Incident response: see `docs/ops/incident-response.md`.
