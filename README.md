# Pronto MVP

Pronto is a purpose-driven AI customer service MVP for Singapore SMEs. This repo is a real product skeleton: operator/client dashboards, OpenAI-first agent orchestration, Postgres + pgvector RAG, Meta WhatsApp Cloud API and Telegram webhook adapters, escalation handling, and an internal pilot console.

## Local Setup

Codex may inherit a narrow PATH. Use this prefix when running local commands:

```bash
export PATH="/opt/homebrew/bin:/usr/local/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH"
```

Create local env and start Postgres:

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Seeded logins:

- `operator@pronto.sg` / `pronto-operator`
- `owner@northbridgenasi.sg` / `pronto-client`

Set `PRONTO_USE_MOCK_AI=1` to run without API calls. Set `OPENAI_API_KEY` and `PRONTO_USE_MOCK_AI=0` to use live OpenAI Responses API and embeddings.

## Channels

WhatsApp Cloud API webhook:

- Verification URL: `https://<public-host>/api/webhooks/whatsapp/<channelId>`
- Uses `hub.verify_token` against channel settings `verifyToken` or `WHATSAPP_VERIFY_TOKEN`
- Verifies `X-Hub-Signature-256` using channel credential `appSecret` or `WHATSAPP_APP_SECRET`
- Sends replies through Graph `/messages` using channel credential `accessToken` and `phoneNumberId`

Telegram webhook:

- URL: `https://<public-host>/api/webhooks/telegram/<channelId>`
- Set with Bot API `setWebhook`
- Uses `X-Telegram-Bot-Api-Secret-Token` against channel settings `webhookSecret` or `TELEGRAM_WEBHOOK_SECRET`
- Sends replies through `sendMessage`

For local webhook testing, expose Next.js with an HTTPS tunnel and register the public URL with Meta/Telegram.

## MVP Guardrails

The v1 agent:

- Answers only from retrieved knowledge chunks.
- Escalates low-confidence retrieval.
- Escalates complaints, refunds, legal/medical issues, urgency/frustration, severe allergy questions, and out-of-scope requests.
- Does not run outbound marketing.
- Does not process payments, issue refunds, cancel bookings, modify orders, or mutate client systems.
- Creates dashboard-visible escalations and attempts owner notification through active Telegram/WhatsApp settings.

## Scripts

```bash
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm db:migrate
pnpm db:seed
```

