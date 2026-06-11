# Agent Context

Minimal map of the repo for a coding agent. Pair with `docs/architecture.md` for request-flow detail.

## Stack
- Next.js 16 (App Router, React 19, server components) on Node 20.
- Postgres 15+ with pgvector + pgcrypto, plain `pg` driver. No ORM.
- Tailwind 4. ESLint flat config. Vitest + Testing Library. tsx for scripts.
- Package manager: pnpm.

## Entry Points
- `pnpm dev` → Next dev on `127.0.0.1:3000`.
- `pnpm migrate` → runs `db/migrations/*.sql` in order, tracked in `schema_migrations`.
- `pnpm seed` → seeds operator + one F&B pilot client.
- `pnpm test` → Vitest. `pnpm typecheck` → `tsc --noEmit`. `pnpm lint` → ESLint.
- One-shot workers: `pnpm outbox:retry`, `pnpm risk:monitor:pricing`, `pnpm risk:monitor:policy`, `pnpm monthly:report --client <id>`.
- Preflight: `pnpm staging:preflight` checks env + DB + provider creds before live channel testing.

## Directory Layout

### `src/app/`
- `api/` — route handlers.
  - `webhooks/{whatsapp,telegram,messenger,instagram,email}/[channelId]` — inbound channel webhooks (verify signature, normalize, batch-process).
  - `webhooks/email/[channelId]/events` — Postmark/Resend bounce / spam-complaint / delivery webhook.
  - `escalations` — claim/resolve/retry + bulk_claim/bulk_assign/bulk_resolve.
  - `operator/integrations` (POST/DELETE) + `operator/integrations/test` (POST) — integration credential CRUD + live test calls.
  - `operator/monthly-report` (GET) — JSON-shaped monthly check-in.
  - `assistant`, `client`, `console`, `csat`, `auth`, `operator` — feature endpoints.
- `operator/` — operator dashboard pages.
  - `clients/[clientId]/...` — per-client admin: conversations, channels, knowledge, flows, users, escalations, test, offboarding.
  - `clients/[clientId]/conversations/[conversationId]/trace` — per-conversation trace view (messages + provider events + escalations).
  - `settings/`, `alerts/`, `quality/`, `escalations/`, `conversations/`.
- `client/` — client-tenant dashboard mirror (inbox, conversations, knowledge, flows, settings, test, assistant, escalations).
- `csat/`, `login/`, `page.tsx`.

### `src/lib/`
- **Core engine**
  - `agent/engine.ts` — main agent run: small-talk → AI disclosure → pre-gen guardrails → retrieval → integration tools → provider selection (+failover) → self-check → escalation or answer. Emits a row to `agent_traces` on every return path.
  - `agent/guardrails.ts` — pre-gen topic/sentiment/scope checks compiled from `agent_configs.escalation_rules`.
  - `agent/self-check.ts` — post-gen citation + traceability check.
  - `agent/trace.ts` — `AgentTraceBuilder` that records per-run telemetry to `agent_traces`.
  - `agent/integration-tools.ts` — intent detector + invoker for live read-only integrations; results become synthetic high-score knowledge chunks tagged `live_source: true`.
  - `agent/config.ts`, `agent/readiness.ts` — per-client agent config + live-readiness signal.
- **Knowledge / RAG**
  - `knowledge/ingest.ts`, `parse-upload.ts`, `chunk.ts`, `website.ts` — ingestion + chunking for PDF/DOCX/TXT/MD/CSV + crawl.
  - `knowledge/retrieve.ts`, `query.ts` — pgvector retrieval with confidence threshold.
  - `knowledge/manage.ts`, `metadata.ts`, `refresh.ts` — admin operations + monthly-refresh queue.
- **Channels**
  - `channels/whatsapp.ts`, `telegram.ts` — inbound normalize + signature/secret verify + outbound send.
  - `channels/messenger.ts`, `instagram.ts` — Meta Graph FB/IG adapters.
  - `channels/email.ts` — Postmark/Resend adapter with RFC-5322 threading (`Message-Id` / `In-Reply-To` / `References`), auto-responder suppression, attachment + DMARC handling, HTML→text fallback, outbound `Auto-Submitted` / `X-Auto-Response-Suppress`, and a suppression list (`email_suppressions`).
  - `channels/email-events.ts` — bounce / spam-complaint / delivery webhook handler; writes to `email_suppressions` and marks `outbound_messages` failed.
  - `channels/dispatch.ts` — kind-aware send wrapper. `policy.ts` — WhatsApp template-only guardrail.
  - `channels/process.ts` — inbound message → conversation upsert → agent run → outbound send or escalation handoff.
  - `channels/webhook-batch.ts` — partial-failure aware batch handler for one provider delivery.
  - `channels/outbox.ts` — durable outbound queue with retry; flushed in-route and by `outbox:retry` worker.
  - `channels/health.ts` — credential validity + live ping per channel.
- **LLM providers**
  - `llm/index.ts` — provider router with failover.
  - `llm/openai.ts`, `azure.ts`, `anthropic.ts`, `openai-compatible.ts`, `free-providers.ts`, `mock.ts` — adapters.
  - `llm/credentials.ts` — encrypted per-provider key storage (AES-256-GCM, keyed by `PRONTO_SECRETS_KEY`).
  - `llm/catalog.ts`, `mock-status.ts`, `prompt.ts`.
- **Integrations (read-only)**
  - `integrations/types.ts`, `index.ts` — definitions + library registry.
  - `integrations/credentials.ts` — per-client encrypted credential storage (same crypto scheme as LLM).
  - `integrations/google-calendar.ts`, `calendly.ts` — availability.
  - `integrations/shopify.ts`, `woocommerce.ts` — catalog + order status (refunds/modifications escalate).
  - `integrations/delivery.ts` — generic 3PL tracking endpoint pattern.
  - `integrations/inventory.ts` — generic per-SKU inventory endpoint pattern.
- **Escalation / Triage**
  - `escalations.ts` — owner notification channel selection + delivery status.
  - `escalations-bulk.ts` — bulk claim / assign / resolve with audit logs.
  - `channels/escalation-handoff.ts` — holding reply copy.
  - `triage-flow.ts`, `triage-flow-store.ts` — React Flow editor compiled into guardrails.
- **Data / reporting**
  - `dashboard.ts` — per-client KPI helpers used by client + operator pages.
  - `reporting.ts` — analytics, knowledge gaps, SLA, alerts, operator command center.
  - `monthly-report.ts` — 30-day check-in summary + recommendations (CLI: `pnpm monthly:report`).
  - `trace.ts` — per-conversation trace aggregator (messages + agent_usage_events + escalations + reviews).
  - `pilot-metrics.ts`, `costing.ts`, `csat.ts`, `reviews.ts`, `offboarding.ts`, `brand-voice.ts`.
- **Platform**
  - `db.ts` — `getPool`, `query`, `transaction`.
  - `auth.ts`, `password.ts`, `rbac.ts` — cookie-session auth + role checks.
  - `audit.ts` — `recordAuditLog`.
  - `http-limits.ts` — per-client rate limits + body-size guards (DB-backed buckets in mig 016).
  - `logger.ts` — JSON logs with PII/secret redaction + request IDs.
  - `error-tracking.ts` — local error events; external webhook on `PRONTO_RISK_ALERT_WEBHOOK_URL`.
  - `risk-monitor.ts` — pricing + Meta-policy diff monitors.
  - `env.ts`, `types.ts`.

### `db/migrations/`
Numeric prefix is run order. Highlights:
- `001_initial.sql` — base schema (clients, users, channels, conversations, messages, escalations, reviews, audit_logs, metric_events, knowledge_sources/chunks, agent_configs).
- `002` eval runs, `003` review labels, `004` channel health columns.
- `005` provider portability, `006` escalation delivery status, `007` outbound_messages outbox.
- `008` knowledge_source_versions + agent_config_changes. `009` local-release readiness tables.
- `010` triage_flows, `011` llm_provider_credentials, `012` knowledge_refresh_requests.
- `013` client_assistant_change_requests, `014` assistant_threads, `015` knowledge_chunk_search.
- `016` rate_limit_buckets, `017` risk_monitors, `018` error_events.
- `019` **integration_credentials** (encrypted, per-client, rotation tracking).
- `020` **v2 channel kinds**: `messenger`, `instagram`, `email`.
- `021` **escalations.assigned_to_user_id**.
- `022` **agent_traces** (per-run trace: retrieval scores, prompt hash, latency, failover, steps).
- `023` **email_suppressions** (per-client bounce/complaint blocklist for the email channel).

### `scripts/`
- `migrate.ts`, `seed.ts` — schema + fixtures.
- `eval.ts`, `assistant-eval.ts` — golden-set evals.
- `staging-preflight.ts` — env/DB/credential readiness gate.
- `retry-outbox.ts` — flush stale outbound queue.
- `monthly-report.ts` — 30-day client check-in summary.
- `risk-monitor-pricing.ts`, `risk-monitor-policy.ts` — scheduler hooks.

### `tests/`, `evals/`
Vitest suites + golden eval inputs/outputs.

## Conventions
- Server components by default. Route handlers in `app/api/*/route.ts`.
- DB access via `query`/`transaction` from `lib/db.ts`. Always parameterize.
- All client-scoped queries must filter by `client_id`. `rbac.canAccessClient` enforces operator vs client.
- Audit-loggable mutations call `recordAuditLog`.
- Logging via `logInfo/logWarn/logError` (auto-redacts secrets, phones, message bodies). Include `requestId`.
- Outbound channel sends MUST go through `sendChannelText` so policy + health checks fire.
- Secrets: never read raw process.env in adapters — use `resolveProviderApiKey` / `resolveIntegrationCredential`.

## Env
See `.env.example` and `docs/setup/staging-env.md`. Key flags:
- `PRONTO_USE_MOCK_AI` (`1` default) — deterministic mock provider.
- `PRONTO_SECRETS_KEY` — required for any encrypted credential read/write.
- `AUTH_SECRET` — session cookies; preflight fails if placeholder.
- `APP_BASE_URL` — used in owner-takeover links + webhook setup copy.
- `PRONTO_LLM_PROVIDER`, `PRONTO_ENABLE_PROVIDER_FAILOVER`.
- Channel-specific: `WHATSAPP_*`, `TELEGRAM_*`, `META_GRAPH_VERSION`, `MESSENGER_PAGE_ACCESS_TOKEN`, `INSTAGRAM_PAGE_ACCESS_TOKEN`, `POSTMARK_*`, `RESEND_*`.

## Where to Start
- Read `docs/architecture.md` first.
- Trace a request: `src/app/api/webhooks/whatsapp/[channelId]/route.ts` → `lib/channels/webhook-batch.ts` → `lib/channels/process.ts` → `lib/agent/engine.ts` → `lib/channels/dispatch.ts`.
- For UI: `src/app/operator/page.tsx` and `src/app/client/page.tsx` are the dashboard entry points; both compose panels from `src/components/`.
