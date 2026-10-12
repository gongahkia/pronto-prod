# Staging Environment Checklist

Set these before running a realistic pilot staging environment.

## Core

- `DATABASE_URL`: Postgres connection string. Local Docker default is `postgres://pronto:pronto@localhost:55432/pronto`.
- `AUTH_SECRET`: Long random secret for signed HTTP-only auth cookies.
- `APP_BASE_URL`: Public base URL used in owner takeover links and webhook setup copy.
- `PRONTO_USE_MOCK_AI`: `0` for live OpenAI calls, `1` for deterministic local mock AI.
- `PRONTO_SECRETS_KEY`: 32+ character secret used to encrypt saved channel and integration credentials.
- `PRONTO_ENFORCE_TENANT_SQL`: Set to `1` in staging to fail client-session SQL touching tenant tables without `client_id`. Production enables this unless `PRONTO_DISABLE_TENANT_SQL_GATE=1`.

## OpenAI

- `OPENAI_API_KEY`: Required when `PRONTO_USE_MOCK_AI=0`.
- `OPENAI_BASE_URL`: Optional. Set only for regional or proxy endpoints.
- `OPENAI_RESPONSE_MODEL`: Default response model. Current MVP default is `gpt-5.5`.
- `OPENAI_EMBEDDING_MODEL`: Default embedding model. Current MVP default is `text-embedding-3-small`.

## Azure OpenAI

- `AZURE_OPENAI_API_KEY`: Required when `PRONTO_LLM_PROVIDER=azure`.
- `AZURE_OPENAI_ENDPOINT`: Azure OpenAI resource endpoint. The app uses the OpenAI-compatible `/openai/v1/` path.
- `AZURE_OPENAI_DEPLOYMENT`: Default Azure response deployment name.
- `AZURE_OPENAI_RESPONSE_DEPLOYMENT`: Optional response deployment override.
- `AZURE_OPENAI_EMBEDDING_DEPLOYMENT`: Required when using `PRONTO_EMBEDDING_PROVIDER=azure`.
- `AZURE_OPENAI_REASONING_EFFORT`: Optional, defaults to `minimal` for GPT-5 deployments.
- `PRONTO_EMBEDDING_PROVIDER`: Optional runtime override; set to `azure` for Azure embeddings.
- `PRONTO_EMBEDDING_MODEL`: Optional runtime model/deployment label for embedding telemetry.

## Anthropic

- `ANTHROPIC_API_KEY`: Optional response-generation key for manual fallback.
- `ANTHROPIC_BASE_URL`: Optional. Set only for regional or proxy endpoints.
- `ANTHROPIC_RESPONSE_MODEL`: Optional response model override. Current local default is `claude-sonnet-4-5`.

## WhatsApp Cloud API

- `WHATSAPP_GRAPH_VERSION`: Meta Graph API version for WhatsApp send and health checks. Defaults to `v25.0`; verify the selected version with an authorized sandbox before activation.

Required per-channel credentials and settings for each business:

- `appSecret`
- `accessToken`
- `phoneNumberId`
- `verifyToken` (encrypted channel setting)

For the live WhatsApp prototype, expose local port 3000 through an HTTPS tunnel,
set `APP_BASE_URL` to that public URL, and register
`https://<public-host>/api/webhooks/whatsapp/<channelId>` in Meta. Configure
`settings.escalationHoldingReply` from the operator channel setup UI so escalated
customer messages receive a brand-specific acknowledgement before owner takeover.

## Telegram

- `TELEGRAM_BOT_TOKEN`: Fallback outbound bot token.
- `TELEGRAM_WEBHOOK_SECRET`: Fallback webhook secret token.

Per-channel credentials/settings should be preferred for real clients:

- `botToken`
- `webhookSecret`
- `ownerChatId`

## Messenger

- `META_GRAPH_VERSION`: Meta Graph API version for Messenger and Instagram. Defaults to `v25.0`.
- `MESSENGER_PAGE_ACCESS_TOKEN`: Fallback page access token.
- `MESSENGER_APP_SECRET`: Fallback app secret for `X-Hub-Signature-256`.
- `MESSENGER_VERIFY_TOKEN`: Fallback webhook verification token.

Per-channel credentials/settings should be preferred for real clients:

- `pageAccessToken`
- `appSecret`
- `verifyToken`

## Instagram

- `META_GRAPH_VERSION`: Meta Graph API version for Messenger and Instagram. Defaults to `v25.0`; verify it with an authorized sandbox before activation.

Required per-channel credentials/settings for each Instagram business:

- `pageAccessToken`
- `appSecret`
- `igUserId`
- `pageId` (linked Facebook Page; checked against the professional account)
- `verifyToken`

## Email

Use either Postmark or Resend.

- `POSTMARK_API_TOKEN`: Fallback Postmark server token.
- `POSTMARK_FROM_ADDRESS`: Fallback Postmark sender address.
- `POSTMARK_WEBHOOK_SECRET`: Fallback Postmark inbound/events webhook secret.
- `RESEND_API_KEY`: Fallback Resend API key.
- `RESEND_FROM_ADDRESS`: Fallback Resend sender address.
- `RESEND_WEBHOOK_SECRET`: Fallback Resend inbound/events webhook secret.

Per-channel credentials/settings should be preferred for real clients:

- `provider`: `postmark` or `resend`
- `apiKey`
- `fromAddress`
- `webhookSecret`

## Optional Ops Alerts

- `PRONTO_ERROR_ALERT_WEBHOOK_URL`: External error-alert webhook.

## Required Checks

- Exact staging sequence:
  1. `pnpm migrate`
  2. `pnpm seed` or create the pilot client/operator users manually.
  3. Configure live provider env and save channel credentials.
  4. `pnpm channels:encrypt-credentials`
  5. `pnpm staging:preflight`
  6. `pnpm build`
  7. `pnpm test:e2e`
  8. `docker build --target runner .`
  9. `docker build --target worker .`
  10. Deploy runner + worker.
- Run `pnpm staging:preflight` after setting env vars and before live channel testing. It fails on mock AI in staging, HTTP `APP_BASE_URL`, weak secrets, unreachable DB, missing live provider env credentials, inactive live channels, and active channels with plaintext credentials.
- Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:coverage`, and `pnpm build`.
- Run `docker compose up -d`, `pnpm migrate`, and `pnpm seed` for local staging only.
- Set `PRONTO_USE_MOCK_AI=0`, configure a live provider key, and run one known F&B message through a draft channel before attaching live traffic.
- Hit `/api/readiness` before traffic shift; expect HTTP 200 and `Cache-Control: no-store`.
- Confirm the operator Agent tuning panel shows live AI readiness for the selected provider and model.
- Confirm WhatsApp webhook verification succeeds.
- Confirm Telegram webhook sends a 200 response with the configured secret header.
- Confirm Messenger/Instagram webhook verification succeeds if those channels are enabled.
- Confirm email inbound and email event webhooks return 200 if email is enabled.
- Confirm an ordinary known F&B question answers from sources.
- Confirm refund, complaint, and booking mutation requests escalate.

## Worker Runbook

- Start one worker process per environment with the same `DATABASE_URL`, `PRONTO_SECRETS_KEY`, channel/provider env, and `PRONTO_ENFORCE_TENANT_SQL=1` as the web runner.
- Safe restart: SIGTERM, wait for `worker.stopped`, then start the replacement.
- The worker processes durable inbound jobs before draining the outbox. A fresh
  `worker_heartbeats` row is required by `/api/readiness`; start the worker
  before shifting traffic.
- Alert on `inbound_jobs.status='dead'`, `outbound_messages.status in
  ('dead','uncertain')`, repeated `outbox.flush_failed`, or a stale heartbeat.
- Do not use `pnpm outbox:retry` on `uncertain` sends. Reconcile the provider
  message ID first; the worker only retries known `pending` and `failed` rows.
- Do not delete failed outbox rows during incident response; they preserve idempotency and retry state.

## Tenant Isolation

Prerelease deployment uses app-level RBAC plus the runtime tenant SQL gate. DB-enforced RLS is not enabled yet because the app and migrations currently share the owning DB role; adding RLS needs a dedicated non-owner runtime role and per-request `app.current_client_id`/role session context before policies provide real isolation.

## Channel-Specific Triage

The smart-triage JSON stores global decision terms plus `channelOverrides` per decision node. Runtime guardrails apply `channelRules.<kind>` when a message arrives from that channel, so WhatsApp messages, Telegram bot messages, Instagram DMs, Messenger messages, and email can have different trigger terms or disabled reason codes for the same client.
