# Channel Webhook Setup

For the isolated Meta test-account sequence and evidence levels, see
[Meta sandbox activation](meta-sandbox-verification.md).

## Local HTTPS Tunnel

Run the app locally and expose it with an HTTPS tunnel:

```bash
pnpm dev
ngrok http 3000
```

Use the HTTPS forwarding URL as `APP_BASE_URL` for local channel testing.
Use only an authorized sandbox or test account. The webhook route requires an
active channel and encrypted channel credentials. Start `pnpm worker` against
the same migrated database; the webhook itself only stores a durable job.

## WhatsApp Cloud API

Webhook URL:

```text
https://<public-host>/api/webhooks/whatsapp/<channelId>
```

Verification:

- Meta sends `hub.mode`, `hub.verify_token`, and `hub.challenge`.
- Pronto compares `hub.verify_token` against that channel's encrypted `verifyToken` setting.
- On success, Pronto returns `hub.challenge`.

Inbound security:

- Pronto verifies `X-Hub-Signature-256` with that channel's encrypted `appSecret` credential.

Outbound send:

- The worker sends text replies through Graph `/messages` while the customer
  service window is open; approved templates use the template payload.
- Required channel credential fields are `accessToken` and `phoneNumberId`.

Delivery status callbacks update matching outbound rows and never enter the
agent. Stale in-flight sends require manual reconciliation.

## Instagram Direct Messages

Webhook URL:

```text
https://<public-host>/api/webhooks/instagram/<channelId>
```

This implementation uses a manually provisioned Facebook Login linked-Page
access token, linked Page ID, Instagram Professional account ID, app secret, and verify
token. It does not support personal accounts or Instagram Login OAuth. The
route validates the signature and professional-account mapping, ignores echo
events, and persists customer DMs for the shared worker. Outbound replies use
the same tenant's professional account and the customer sender ID. See
[`docs/sprint1/technical-readiness.md`](../sprint1/technical-readiness.md)
for App Review and test-account prerequisites.

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
