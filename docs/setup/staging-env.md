# Staging Environment Checklist

Set these before running a realistic pilot staging environment.

## Core

- `DATABASE_URL`: Postgres connection string. Local Docker default is `postgres://pronto:pronto@localhost:55432/pronto`.
- `AUTH_SECRET`: Long random secret for signed HTTP-only auth cookies.
- `APP_BASE_URL`: Public base URL used in owner takeover links and webhook setup copy.
- `PRONTO_USE_MOCK_AI`: `0` for live OpenAI calls, `1` for deterministic local mock AI.
- `PRONTO_SECRETS_KEY`: 32+ character secret used to encrypt saved provider and integration credentials.
- `PRONTO_ENFORCE_TENANT_SQL`: Set to `1` in staging to fail client-session SQL touching tenant tables without `client_id`. Production enables this unless `PRONTO_DISABLE_TENANT_SQL_GATE=1`.

## OpenAI

- `OPENAI_API_KEY`: Required when `PRONTO_USE_MOCK_AI=0`.
- `OPENAI_BASE_URL`: Optional. Set only for regional or proxy endpoints.
- `OPENAI_RESPONSE_MODEL`: Default response model. Current MVP default is `gpt-5.5`.
- `OPENAI_EMBEDDING_MODEL`: Default embedding model. Current MVP default is `text-embedding-3-small`.

## Azure OpenAI

Use `PRONTO_LLM_PROVIDER=azure` or select Azure OpenAI in the operator Agent tuning panel.

- `AZURE_OPENAI_API_KEY`: Azure OpenAI key for live Azure calls.
- `AZURE_OPENAI_BASE_URL`: Azure v1 base URL, for example `https://<resource>.openai.azure.com/openai/v1/`.
- `AZURE_OPENAI_ENDPOINT`: Optional shorthand endpoint, for example `https://<resource>.openai.azure.com`; Pronto appends `/openai/v1/`.
- `AZURE_OPENAI_RESPONSE_MODEL`: Azure response deployment name.
- `AZURE_OPENAI_EMBEDDING_MODEL`: Azure embedding deployment name.
- `AZURE_OPENAI_DEPLOYMENT`: Backward-compatible alias for `AZURE_OPENAI_RESPONSE_MODEL`.
- `AZURE_OPENAI_EMBEDDING_DEPLOYMENT`: Backward-compatible alias for `AZURE_OPENAI_EMBEDDING_MODEL`.

The first-class Azure path targets Azure OpenAI's v1 OpenAI-compatible API. Older Azure `api-version` deployment URLs are not used by this app path.

## WhatsApp Cloud API

- `WHATSAPP_GRAPH_VERSION`: Meta Graph API version for WhatsApp send and health checks. Defaults to `v20.0` for current local-release compatibility.
- `WHATSAPP_APP_SECRET`: Used to verify `X-Hub-Signature-256`.
- `WHATSAPP_VERIFY_TOKEN`: Fallback webhook verification token.
- `WHATSAPP_ACCESS_TOKEN`: Fallback outbound send token when not stored per channel.

Per-channel credentials should be preferred for real clients:

- `appSecret`
- `accessToken`
- `phoneNumberId`

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

- `META_GRAPH_VERSION`: Meta Graph API version for Messenger and Instagram. Defaults to `v20.0`.
- `MESSENGER_PAGE_ACCESS_TOKEN`: Fallback page access token.
- `MESSENGER_APP_SECRET`: Fallback app secret for `X-Hub-Signature-256`.
- `MESSENGER_VERIFY_TOKEN`: Fallback webhook verification token.

Per-channel credentials/settings should be preferred for real clients:

- `pageAccessToken`
- `appSecret`
- `verifyToken`

## Instagram

- `META_GRAPH_VERSION`: Meta Graph API version for Messenger and Instagram. Defaults to `v20.0`.
- `INSTAGRAM_PAGE_ACCESS_TOKEN`: Fallback page access token.
- `INSTAGRAM_APP_SECRET`: Fallback app secret for `X-Hub-Signature-256`.
- `INSTAGRAM_VERIFY_TOKEN`: Fallback webhook verification token.

Per-channel credentials/settings should be preferred for real clients:

- `pageAccessToken`
- `appSecret`
- `igUserId`
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
- `PRONTO_RISK_ALERT_WEBHOOK_URL`: External pricing/policy risk-monitor webhook.

## Required Checks

- Run `pnpm staging:preflight` after setting env vars and before live channel testing. It verifies live AI mode, secret placeholders, database reachability, provider credential availability, and Telegram/WhatsApp channel config without printing secret values.
- Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build`.
- Run `docker compose up -d`, `pnpm migrate`, and `pnpm seed`.
- Set `PRONTO_USE_MOCK_AI=0`, configure a live provider key, and run one console message from the Test assistant before attaching live channels.
- Confirm the operator Agent tuning panel shows live AI readiness for the selected provider and model.
- Confirm WhatsApp webhook verification succeeds.
- Confirm Telegram webhook sends a 200 response with the configured secret header.
- Confirm Messenger/Instagram webhook verification succeeds if those channels are enabled.
- Confirm email inbound and email event webhooks return 200 if email is enabled.
- Confirm an ordinary known F&B question answers from sources.
- Confirm refund, complaint, and booking mutation requests escalate.
