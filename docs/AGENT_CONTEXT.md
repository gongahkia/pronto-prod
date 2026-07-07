# Agent Context

Minimal repo map for coding agents. Pair with `docs/architecture.md` for request flow.

## Stack
- Next.js 16 App Router, React 19, Node 20.
- Postgres with pgvector + pgcrypto, plain `pg` driver. No ORM.
- Tailwind 4, ESLint flat config, Vitest + Testing Library, Playwright.
- Package manager: pnpm.

## Entry Points
- `pnpm dev` -> Next dev on `127.0.0.1:3000`.
- `pnpm migrate` -> runs `db/migrations/*.sql` in order.
- `pnpm seed` -> seeds operator + one F&B pilot client.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` -> local gates.
- `pnpm test:e2e` -> Playwright smoke after build + migrated/seeded DB.
- `pnpm outbox:retry` -> one-shot outbound retry worker.
- `pnpm worker` -> long-running outbound retry worker.
- `pnpm staging:preflight` -> env + DB + credential readiness.
- `pnpm channels:encrypt-credentials` -> backfills plaintext channel credentials.

## App Surface
- `src/app/api/webhooks/{whatsapp,telegram,messenger,instagram,email}/[channelId]` -> inbound channel webhooks.
- `src/app/api/webhooks/email/[channelId]/events` -> Postmark/Resend delivery, bounce, and complaint events.
- `src/app/api/escalations` -> claim, assign, resolve, retry, and bulk escalation actions.
- `src/app/api/operator/*` -> operator-managed clients, channels, knowledge, integrations, brand voice, and agent config.
- `src/app/api/client/*` -> client settings, knowledge, refresh requests, assistant change requests, and flow saves.
- `src/app/operator/*` -> operator dashboard and per-client admin.
- `src/app/client/*` -> slim client dashboard: overview, inbox, conversations, knowledge, assistant change requests, escalations, settings.
- `src/app/csat/*`, `src/app/login/*`.

## Core Libraries
- `src/lib/agent/engine.ts` -> small-talk, disclosure, guardrails, retrieval, integrations, provider call, self-check, escalation/answer.
- `src/lib/agent/guardrails.ts` -> pre-generation topic, sentiment, action, and scope checks from `agent_configs.escalation_rules`.
- `src/lib/agent/self-check.ts` -> citation and traceability check.
- `src/lib/agent/trace.ts` -> per-run telemetry to `agent_traces`.
- `src/lib/knowledge/{ingest,parse-upload,chunk,retrieve,query,manage,metadata,refresh}.ts` -> file/manual knowledge ingestion, pgvector retrieval, and refresh requests.
- `src/lib/channels/*` -> WhatsApp, Telegram, Messenger, Instagram, Email adapters, dispatch, outbox, health, credentials, and inbound processing.
- `src/lib/integrations/*` -> read-only Shopify, WooCommerce, Google Calendar, Calendly, delivery, and inventory tools.
- `src/lib/escalations.ts`, `src/lib/escalations-bulk.ts` -> owner handoff and bulk escalation actions.
- `src/lib/triage-flow.ts`, `src/lib/triage-flow-store.ts` -> smart-triage JSON compiled into escalation rules.
- `src/lib/dashboard.ts`, `src/lib/reporting.ts` -> dashboard and reporting aggregates for kept pages.
- `src/lib/llm/{index,openai,anthropic,mock,catalog,credentials,prompt}.ts` -> mock/OpenAI/Anthropic provider boundary.
- `src/lib/{auth,password,rbac,audit,db,logger,error-tracking,types}.ts` -> platform primitives.

## Migrations
- `001` base schema.
- `002` eval runs.
- `003` review-label legacy tables.
- `004` channel health columns.
- `005` provider portability legacy columns.
- `006` escalation delivery status.
- `007` outbound outbox.
- `008` knowledge versions + agent config changes.
- `009` local-release readiness legacy tables.
- `010` triage flows.
- `011` provider-credential legacy table.
- `012` knowledge refresh requests.
- `013` client assistant change requests.
- `014` assistant legacy tables.
- `015` knowledge search.
- `016` deprecated request bucket table.
- `017` deprecated ops-watch tables.
- `018` error events.
- `019` integration credentials.
- `020` Messenger, Instagram, and Email channel kinds.
- `021` escalation assignment.
- `022` agent traces.
- `023` email suppressions.
- `024` audit hardening.
- `025` channel credential encryption.
- `026` user session version.
- `027` outbound idempotency scope.
- `028` drops deprecated scope-cut tables.

## Scripts
- `scripts/migrate.ts`, `scripts/seed.ts`.
- `scripts/eval.ts`.
- `scripts/staging-preflight.ts`.
- `scripts/encrypt-channel-credentials.ts`.
- `scripts/retry-outbox.ts`, `scripts/worker.ts`.

## Conventions
- Server components by default. Route handlers live under `src/app/api`.
- DB access goes through `query` / `transaction` from `src/lib/db.ts`; always parameterize.
- Client-scoped reads and writes must filter by `client_id`.
- Mutations that affect customers or config should call `recordAuditLog`.
- Customer-facing sends must go through `sendChannelText`.
- Use `logInfo`, `logWarn`, and `logError`; never log full customer messages or secrets.
- Secrets come from env or encrypted channel/integration credential stores.

## Env
See `.env.example` and `docs/setup/staging-env.md`.

Required basics: `DATABASE_URL`, `AUTH_SECRET`, `APP_BASE_URL`, `PRONTO_SECRETS_KEY`.

AI: `PRONTO_USE_MOCK_AI`, `PRONTO_LLM_PROVIDER`, `PRONTO_EMBEDDING_PROVIDER`, `OPENAI_API_KEY`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_EMBEDDING_DEPLOYMENT`, optional `ANTHROPIC_API_KEY`.

Channels: `WHATSAPP_*`, `TELEGRAM_*`, `META_GRAPH_VERSION`, `MESSENGER_*`, `INSTAGRAM_*`, `POSTMARK_*`, `RESEND_*`.

## Where To Start
- Request path: webhook route -> `src/lib/channels/process.ts` -> `src/lib/agent/engine.ts` -> `src/lib/channels/dispatch.ts`.
- Channel-specific triage: `src/lib/triage-flow.ts` compiles decision-node `channelOverrides` into `channelRules`, and `src/lib/agent/guardrails.ts` applies the matching channel policy.
- Operator UI: `src/app/operator/page.tsx`, `src/app/operator/clients/[clientId]/page.tsx`, and sibling per-client pages.
- Client UI: `src/app/client/page.tsx`, `src/app/client/inbox/page.tsx`, `src/app/client/knowledge/page.tsx`, `src/app/client/assistant/page.tsx`.
- Data model: read `db/migrations/001_initial.sql`, then migration deltas relevant to the feature.
