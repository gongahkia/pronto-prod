# Pronto Prerelease

Local prerelease app for Pronto's customer-service pipeline, business inbox, knowledge base, channel handoff, and owner escalation flows.

## Prerequisites

- Node.js 20+
- pnpm
- Docker, if you want the bundled local Postgres/pgvector database

## Local Setup

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm migrate
pnpm seed
pnpm dev
```

Open `http://127.0.0.1:3000`.

For the isolated PS.Cafe Raffles City MVP with Mailpit, a guarded worker,
sample customer emails and fake Meta providers, follow
[the local demo runbook](docs/demos/local-mvp.md). It uses a marked
`pronto_test` database and requires no real provider account.

The business workspace has two destinations: Inbox and Business Knowledge. Inbox includes attention filters and recent conversation updates. Business Knowledge contains cards for knowledge sources, channels, brand voice, handoff rules, and testing and publication; editors expand within the page. Open `/client/inbox` with an authorized business responder account. The development-only connected customer simulator is `/demo/customer`; see [its setup guide](docs/demos/customer-simulator.md).

Restaurant booking enquiries in the real-model path can check Chope and return a booking link with the requested date, time and party size. PostgreSQL stores availability observations and a shared cache; the worker refreshes recently requested combinations hourly and enquiries require observations no older than five minutes before claiming availability. See [Chope setup, scheduling and storage](docs/integrations/chope-live-read.md) for the required flags, tenant mapping, Chromium and worker setup.

The old HQ operator frontend has been removed under PRON-87. Operator sign-in opens `/account`; administration uses the existing protected APIs through the [authenticated CLI](docs/ops/operator-cli.md). Business approvals, tested assistant drafts and channel activation gates remain independent. An operator login does not grant access to the business inbox.

PS.Cafe demo login, created by [the local demo setup](docs/demos/local-mvp.md):

- Email / username: `responder@ps-cafe-demo.test`
- Password: `pronto-ps-demo`

Sign in at `/login`. This account can use both the customer chat at `/demo/customer` and the business inbox at `/client/inbox`.

Other seeded logins:

- Operator: `operator@pronto.sg` / `pronto-operator`
- Client: `owner@northbridgenasi.sg` / `pronto-client`

## Useful Commands

pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm outbox:retry

Use pnpm outbox:retry after testing failed WhatsApp/Telegram/Instagram/Email owner replies or stale `sending` rows.

## Environment Notes

The example environment uses real inference with `PRONTO_USE_MOCK_AI=0`. Customer conversations require an available configured model; unavailable choices remain visible and disabled. Groq uses approved local text retrieval with no embedding service. Optional OpenAI, Azure and Anthropic adapters remain available for separately configured deployments. Azure embeddings require `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` and `PRONTO_EMBEDDING_PROVIDER=azure`. Internal automated tests can explicitly enable mock AI; the customer API rejects mock conversations.

Live WhatsApp, Instagram, Messenger, Telegram, and Email testing requires real channel credentials plus a public HTTPS tunnel set as APP_BASE_URL. See docs/channels/webhook-setup.md and docs/setup/staging-env.md.

Smart-triage JSON supports per-channel overrides under decision nodes, so clients can tune WhatsApp messages, Telegram bot messages, Instagram DMs, Messenger messages, and email differently.

## Local Release Checks

pnpm typecheck
pnpm lint
pnpm test
pnpm build

If a migration was added, run `pnpm migrate` before starting the app again.
