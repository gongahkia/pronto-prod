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

The business workspace includes Inbox, Needs Attention, Recent Activity, Business Knowledge and Connected Channels. Open `/client/inbox` with an authorized business responder account. The development-only connected customer simulator is `/demo/customer`; see [its setup guide](docs/demos/customer-simulator.md).

The old HQ operator frontend has been removed under PRON-87. Operator sign-in opens `/account`; administration uses the existing protected APIs through the [authenticated CLI](docs/ops/operator-cli.md). Business approvals, tested assistant drafts and channel activation gates remain independent. An operator login does not grant access to the business inbox.

Seeded logins:

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

The app defaults to mock AI with PRONTO_USE_MOCK_AI=1, so local testing works without paid model keys. To test live providers, set PRONTO_USE_MOCK_AI=0 and configure OPENAI_API_KEY, AZURE_OPENAI_API_KEY + AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_DEPLOYMENT, or ANTHROPIC_API_KEY as a manual fallback. Azure embeddings require AZURE_OPENAI_EMBEDDING_DEPLOYMENT and PRONTO_EMBEDDING_PROVIDER=azure.

Live WhatsApp, Instagram, Messenger, Telegram, and Email testing requires real channel credentials plus a public HTTPS tunnel set as APP_BASE_URL. See docs/channels/webhook-setup.md and docs/setup/staging-env.md.

Smart-triage JSON supports per-channel overrides under decision nodes, so clients can tune WhatsApp messages, Telegram bot messages, Instagram DMs, Messenger messages, and email differently.

## Local Release Checks

pnpm typecheck
pnpm lint
pnpm test
pnpm build

If a migration was added, run `pnpm migrate` before starting the app again.
