# Human Setup

## Local AI

Use the repo-root `.env` for local secrets. It is ignored by git.

For Azure OpenAI local testing:

```env
PRONTO_USE_MOCK_AI=0
PRONTO_LLM_PROVIDER=azure
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com
AZURE_OPENAI_DEPLOYMENT=<chat-deployment>
AZURE_OPENAI_EMBEDDING_DEPLOYMENT=<embedding-deployment>
```

Also set the client Agent tuning panel to:

- Response provider: `azure`
- Embedding provider: `azure`
- Response model: Azure chat deployment name
- Embedding model: Azure embedding deployment name

Seeded clients default to OpenAI for embeddings, so Azure must be selected there too if you do not want to provide `OPENAI_API_KEY`.

For deployment, store provider keys in deployment/platform secrets, not in committed files. The app already has provider wiring for Azure OpenAI, OpenAI, Anthropic, Groq, OpenRouter, GitHub Models, Hugging Face, Cerebras, and other OpenAI-compatible providers.

## Webhooks

A webhook is a public HTTPS URL that WhatsApp, Telegram, Messenger, Instagram, or email providers call when a customer sends a message.

Needed for:

- Real inbound channel testing
- Live replies on WhatsApp, Telegram, Messenger, Instagram, or email
- Provider verification challenges

Not needed for:

- Local console testing inside the app
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
WHATSAPP_GRAPH_VERSION=v20.0
WHATSAPP_APP_SECRET=...
WHATSAPP_VERIFY_TOKEN=...
WHATSAPP_ACCESS_TOKEN=...
```

Per-channel credential fields preferred for real clients:

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
META_GRAPH_VERSION=v20.0
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
META_GRAPH_VERSION=v20.0
INSTAGRAM_PAGE_ACCESS_TOKEN=...
INSTAGRAM_APP_SECRET=...
INSTAGRAM_VERIFY_TOKEN=...
```

Per-channel credential fields:

- `pageAccessToken`
- `appSecret`
- `igUserId`

Per-channel setting:

- `verifyToken`

## Verification

After env/channel setup:

```bash
docker compose up -d
pnpm migrate
pnpm seed
pnpm staging:preflight
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Seeded local logins:

- Operator: `operator@pronto.sg` / `pronto-operator`
- Client: `owner@northbridgenasi.sg` / `pronto-client`
