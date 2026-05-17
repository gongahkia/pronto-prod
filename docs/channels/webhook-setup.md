# Channel Webhook Setup

## Local HTTPS Tunnel

Run the app locally and expose it with an HTTPS tunnel:

```bash
pnpm dev
ngrok http 3000
```

Use the HTTPS forwarding URL as `APP_BASE_URL` for local channel testing.

## WhatsApp Cloud API

Webhook URL:

```text
https://<public-host>/api/webhooks/whatsapp/<channelId>
```

Verification:

- Meta sends `hub.mode`, `hub.verify_token`, and `hub.challenge`.
- Pronto compares `hub.verify_token` against channel setting `verifyToken`, then `WHATSAPP_VERIFY_TOKEN`.
- On success, Pronto returns `hub.challenge`.

Inbound security:

- Pronto verifies `X-Hub-Signature-256` with channel credential `appSecret`, then `WHATSAPP_APP_SECRET`.

Outbound send:

- Pronto sends text replies through Graph `/messages`.
- Required channel credential fields are `accessToken` and `phoneNumberId`.

Policy rule:

- Do not use WhatsApp for cold outreach, broadcasts, or promotional pushes in v1.
- Future proactive notifications must use approved WhatsApp templates only.

## Telegram

Webhook URL:

```text
https://<public-host>/api/webhooks/telegram/<channelId>
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

Inbound security:

- Telegram sends `X-Telegram-Bot-Api-Secret-Token`.
- Pronto compares the header against channel setting `webhookSecret`, then `TELEGRAM_WEBHOOK_SECRET`.

Outbound send:

- Pronto sends replies with `sendMessage`.
- Required channel credential field is `botToken`.

