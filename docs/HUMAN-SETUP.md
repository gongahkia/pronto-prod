# Human Setup

## Local AI

Use the repo-root `.env` for local secrets. It is ignored by git.

For live OpenAI local testing:

```env
PRONTO_USE_MOCK_AI=0
PRONTO_LLM_PROVIDER=openai
OPENAI_API_KEY=...
```

For Anthropic as a manual response fallback:

```env
ANTHROPIC_API_KEY=...
ANTHROPIC_RESPONSE_MODEL=claude-sonnet-4-5
```

For Azure OpenAI local testing:

```env
PRONTO_USE_MOCK_AI=0
PRONTO_LLM_PROVIDER=azure
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com
AZURE_OPENAI_DEPLOYMENT=<response-deployment>
AZURE_OPENAI_EMBEDDING_DEPLOYMENT=<embedding-deployment>
PRONTO_EMBEDDING_PROVIDER=azure
```

The triage flow JSON can tune behavior per channel with decision-node `channelOverrides`. Use platform-specific language such as WhatsApp message, Telegram bot message, Instagram DM, Messenger message, and email.

For deployment, store provider and channel keys in deployment/platform secrets or encrypted per-channel records, not in committed files. The app supports mock AI, OpenAI, and Anthropic.

Deployment core env:

```env
DATABASE_URL=...
AUTH_SECRET=<32+ chars>
APP_BASE_URL=https://<public-app-host>
PRONTO_SECRETS_KEY=<32+ chars>
PRONTO_USE_MOCK_AI=0
PRONTO_ENFORCE_TENANT_SQL=1
```

## Webhooks

A webhook is a public HTTPS URL that WhatsApp, Telegram, Messenger, Instagram, or email providers call when a customer sends a message.

Needed for:

- Real inbound channel testing
- Live replies on WhatsApp, Telegram, Messenger, Instagram, or email
- Provider verification challenges

Not needed for:

- Unit tests
- Mock AI flow testing

Local setup:

```bash
pnpm dev
ngrok http 3000
```

Set:

```env
APP_BASE_URL=https://<ngrok-host>
```

Webhook URLs:

```text
https://<public-host>/api/webhooks/whatsapp/<channelId>
https://<public-host>/api/webhooks/telegram/<channelId>
https://<public-host>/api/webhooks/messenger/<channelId>
https://<public-host>/api/webhooks/instagram/<channelId>
https://<public-host>/api/webhooks/email/<channelId>
```

## WhatsApp

Apply/setup through Meta for Developers:

https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started

Required:

- Meta developer account
- Meta app with WhatsApp product
- WhatsApp Business Account
- Business phone number
- App secret
- Access token
- Phone number ID
- Webhook verify token

Repo/env fields:

```env
WHATSAPP_GRAPH_VERSION=v25.0
```

Set these fields on each WhatsApp channel; global secrets are not used:

- `appSecret`
- `accessToken`
- `phoneNumberId`

Per-channel setting:

- `verifyToken`
- optional owner `ownerPhone`

## Telegram

Yes: create the bot through `@BotFather`.

Official Bot API webhook docs:

https://core.telegram.org/bots/api#setwebhook

Required:

- Bot token from BotFather
- Webhook secret token you generate
- Public HTTPS webhook URL

Repo/env fields:

```env
TELEGRAM_BOT_TOKEN=...
TELEGRAM_WEBHOOK_SECRET=...
```

Register webhook:

```bash
curl "https://api.telegram.org/bot<bot-token>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://<public-host>/api/webhooks/telegram/<channelId>",
    "secret_token": "<webhook-secret>"
  }'
```

Per-channel credential fields preferred:

- `botToken`

Per-channel settings:

- `webhookSecret`
- optional owner `ownerChatId`

## Messenger

Get credentials through Meta for Developers:

https://developers.facebook.com/documentation/business-messaging/messenger-platform/webhooks

Required:

- Meta developer account
- Meta app with Messenger product
- Facebook Page connected to the app
- Page access token
- App secret
- Webhook verify token

Repo/env fields:

```env
META_GRAPH_VERSION=v25.0
MESSENGER_PAGE_ACCESS_TOKEN=...
MESSENGER_APP_SECRET=...
MESSENGER_VERIFY_TOKEN=...
```

Per-channel credential fields:

- `pageAccessToken`
- `appSecret`

Per-channel setting:

- `verifyToken`

## Instagram

Use Meta's Messenger API for Instagram.

Official start docs:

https://developers.facebook.com/docs/messenger-platform/instagram/get-started

Required:

- Instagram professional account
- Facebook Page linked to that Instagram account
- Meta app
- Page access token with Instagram messaging permissions
- App secret
- Webhook verify token
- Instagram user ID

Repo/env fields:

```env
META_GRAPH_VERSION=v25.0
```

Per-channel credential fields:

- `pageAccessToken`
- `appSecret`
- `igUserId`

Per-channel setting:

- `verifyToken`

## Email

Use Postmark or Resend.

Required:

- API key
- Verified sender/from address
- Webhook secret you generate
- Public HTTPS webhook URL

Inbound webhook:

```text
https://<public-host>/api/webhooks/email/<channelId>
```

Delivery/bounce event webhook:

```text
https://<public-host>/api/webhooks/email/<channelId>/events
```

Postmark env:

```env
POSTMARK_API_TOKEN=...
POSTMARK_FROM_ADDRESS=support@example.com
POSTMARK_WEBHOOK_SECRET=...
```

Resend env:

```env
RESEND_API_KEY=...
RESEND_FROM_ADDRESS=support@example.com
RESEND_WEBHOOK_SECRET=...
```

Per-channel credential fields:

- `provider`: `postmark` or `resend`
- `apiKey`
- `fromAddress`

Per-channel setting:

- `webhookSecret`
- optional `defaultSubject`

## Verification

After env/channel setup:

```bash
docker compose up -d
pnpm migrate
pnpm seed
pnpm channels:encrypt-credentials
pnpm staging:preflight
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
docker build --target runner -t pronto-runner:local .
docker build --target worker -t pronto-worker:local .
```

Seeded local logins:

- Operator: `operator@pronto.sg` / `pronto-operator`
- Client: `owner@northbridgenasi.sg` / `pronto-client`

## Worker

Run one retry pass:

```bash
pnpm outbox:retry
```

Run the continuous worker:

```bash
PRONTO_WORKER_OUTBOX_INTERVAL_MS=15000 pnpm worker
```

Safe restart: send SIGTERM, wait for `{"event":"worker.stopped"}`, then start the new process. Watch `outbound_messages.status`, `attempt_count`, and `error_events` for repeated send failures.

## Readiness

- `/api/health` is the liveness probe and does not require DB.
- `/api/readiness` is the deploy gate: strong secrets, HTTPS `APP_BASE_URL` in production, live AI outside explicit mock mode, tenant SQL gate, DB reachability, and `Cache-Control: no-store`.
- CI runs audit, migrations, seed, preflight, typecheck, lint, coverage, build, Playwright, runner Docker smoke, and worker Docker smoke.
