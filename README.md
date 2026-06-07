# Pronto Prerelease

Local prerelease app for Pronto's AI customer-service operations dashboard, client dashboard, triage flows, knowledge base, channel handoff, and pilot QA loops.

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

Seeded logins:

- Operator: `operator@pronto.sg` / `pronto-operator`
- Client: `owner@northbridgenasi.sg` / `pronto-client`

## Useful Commands

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm outbox:retry
```

`pnpm outbox:retry` runs the local outbound retry worker once. Use it after testing failed WhatsApp/Telegram owner replies or stale `sending` rows.

## Environment Notes

The app defaults to mock AI with `PRONTO_USE_MOCK_AI=1`, so local testing works without paid model keys. To test live providers, set `PRONTO_USE_MOCK_AI=0` and configure provider keys either in `.env` or through the operator provider settings UI.

Azure OpenAI is available as a first-class provider with `PRONTO_LLM_PROVIDER=azure` or the operator Agent tuning panel. Set `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_BASE_URL` or `AZURE_OPENAI_ENDPOINT`, and use Azure deployment names for `AZURE_OPENAI_RESPONSE_MODEL` / `AZURE_OPENAI_EMBEDDING_MODEL`. `AZURE_OPENAI_DEPLOYMENT` and `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` are also accepted as aliases.

Free/testing provider controls are available in the operator client settings. No-key providers can be tried locally where the upstream provider still permits unauthenticated calls; key-backed providers require storing the API key with `PRONTO_SECRETS_KEY` configured.

Live WhatsApp and Telegram testing requires real channel credentials plus a public HTTPS tunnel set as `APP_BASE_URL`. See `docs/channels/webhook-setup.md` and `docs/setup/staging-env.md`.

## Local Release Checks

Before calling a local build ready to test:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

If a migration was added, run `pnpm migrate` before starting the app again.
