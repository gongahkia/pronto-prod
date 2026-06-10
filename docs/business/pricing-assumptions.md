# Pricing And Margin Assumptions

Working benchmark assumptions for local release. Replace with signed commercial terms before invoicing.

## Pilot Defaults

- Setup fee: SGD 2,500.
- Monthly retainer: SGD 1,200.
- Included conversations: 500 per month.
- Setup amortization: 6 months.
- Hosting cost placeholder: SGD 80 per client per month.
- Integration maintenance placeholder: SGD 150 per client per month.
- LLM cost buffer: 2x estimated provider cost.

## Add-On Placeholders

- Additional channel: SGD 300-600 setup plus SGD 100-250 per month.
- Read-only integration: SGD 800-2,500 setup depending on API quality.
- Analytics dashboard: SGD 300-800 per month.
- Monthly report/check-in: SGD 250-600 per month.
- Multilingual support: price after pilot quality data.

## Billing Defaults To Confirm

- Currency: SGD for Singapore clients.
- Annual prepay discount: benchmark recommendation is 2 months free.
- Referral incentive: benchmark recommendation is 1 month free for the referrer after the new client signs and pays.

## Cost Monitoring

The app records benchmark token and cost estimates in `agent_usage_events`. These are estimates until live provider usage payloads are wired.

Official provider and channel pricing should be checked before production pricing reviews and once monthly while pilots are live:

- OpenAI API pricing: https://openai.com/api/pricing/
- Anthropic pricing: https://docs.anthropic.com/en/docs/about-claude/pricing
- Google Gemini API pricing: https://ai.google.dev/gemini-api/docs/pricing
- WhatsApp Business Platform pricing: https://whatsappbusiness.com/products/platform-pricing/

Record each monthly review in Jira with the date, reviewer, changed models or message categories, and whether commercial assumptions need to be updated.

A scheduler-backed monitor exists via `pnpm risk:monitor:pricing` (see `scripts/risk-monitor-pricing.ts`). It snapshots each provider pricing page, compares the SHA-256 of the body against the previous snapshot, and records `risk_monitor_findings` rows for changed/unreachable sources. Set `PRONTO_RISK_ALERT_WEBHOOK_URL` to receive external alerts when findings are produced. Run nightly or weekly from external cron (Vercel cron, GitHub Actions, or Render scheduler).
