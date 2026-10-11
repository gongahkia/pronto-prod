# Pronto Prerelease

Local prerelease app for Pronto's AI customer-service operations dashboard, slim client dashboard, smart triage, knowledge base, channel handoff, and owner escalation flows.

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

The client workspace has four main areas: Overview, Inbox, Manage assistant, and Settings. In Manage assistant, edits to knowledge, brand voice, and handoff rules are saved together as a draft. Test a customer question there, then publish the tested draft to make it live. Channel details have a separate save, connection check, and publish flow; activating a channel requires a successful live check.

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
