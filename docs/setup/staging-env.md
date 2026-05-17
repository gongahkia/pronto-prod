# Staging Environment Checklist

Set these before running a realistic pilot staging environment.

## Core

- `DATABASE_URL`: Postgres connection string. Local Docker default is `postgres://pronto:pronto@localhost:55432/pronto`.
- `AUTH_SECRET`: Long random secret for signed HTTP-only auth cookies.
- `APP_BASE_URL`: Public base URL used in owner takeover links and webhook setup copy.
- `PRONTO_USE_MOCK_AI`: `0` for live OpenAI calls, `1` for deterministic local mock AI.

## OpenAI

- `OPENAI_API_KEY`: Required when `PRONTO_USE_MOCK_AI=0`.
- `OPENAI_BASE_URL`: Optional. Set only for regional or proxy endpoints.
- `OPENAI_RESPONSE_MODEL`: Default response model. Current MVP default is `gpt-5.5`.
- `OPENAI_EMBEDDING_MODEL`: Default embedding model. Current MVP default is `text-embedding-3-small`.

## WhatsApp Cloud API

- `WHATSAPP_APP_SECRET`: Used to verify `X-Hub-Signature-256`.
- `WHATSAPP_VERIFY_TOKEN`: Fallback webhook verification token.
- `WHATSAPP_ACCESS_TOKEN`: Fallback outbound send token when not stored per channel.

Per-channel credentials should be preferred for real clients:

- `appSecret`
- `accessToken`
- `phoneNumberId`

## Telegram

- `TELEGRAM_BOT_TOKEN`: Fallback outbound bot token.
- `TELEGRAM_WEBHOOK_SECRET`: Fallback webhook secret token.

Per-channel credentials/settings should be preferred for real clients:

- `botToken`
- `webhookSecret`
- `ownerChatId`

## Required Checks

- Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build`.
- Run `docker compose up -d`, `pnpm db:migrate`, and `pnpm db:seed`.
- Confirm WhatsApp webhook verification succeeds.
- Confirm Telegram webhook sends a 200 response with the configured secret header.
- Confirm an ordinary known F&B question answers from sources.
- Confirm refund, complaint, and booking mutation requests escalate.

