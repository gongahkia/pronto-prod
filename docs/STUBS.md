# Known Stubs and Partial Wiring

Tracks items marked done in `TODO.md` whose implementation is intentionally partial. Add a line here whenever you complete a feature with a known gap so the next agent does not assume full coverage.

## Configuration-blocked (real keys required)
- **Live OpenAI/provider keys** (TODO line 1) — readiness UI + preflight exist; no live key is wired in this checkout.
- **Live Meta WhatsApp app** (TODO line 2) — webhook + send code is real; needs `appSecret`, `accessToken`, `phoneNumberId`, `verifyToken`.
- **Live Telegram bot** (TODO line 3) — webhook + send code is real; needs `botToken`, `webhookSecret`, public HTTPS tunnel.

These three lines are marked done because all in-repo code is implemented. Only ops configuration is missing.

## v2 channels (lines 82–84)
Adapters and outbound dispatch are implemented. **Inbound webhook routes are NOT yet added.** To accept real traffic from Messenger / Instagram / Email, create:
- `src/app/api/webhooks/messenger/[channelId]/route.ts`
- `src/app/api/webhooks/instagram/[channelId]/route.ts`
- `src/app/api/webhooks/email/[channelId]/route.ts` (Postmark or Resend inbound webhook)

Each route should mirror `src/app/api/webhooks/whatsapp/[channelId]/route.ts`: verify signature via the adapter's `verifyXSignature`, call `normalizeXPayload`, then `processWebhookBatch`. Health checks in `lib/channels/health.ts` also need branches for these kinds.

`db/migrations/020_v2_channels.sql` uses `ALTER TYPE … ADD VALUE IF NOT EXISTS`. Works on Postgres 12+. If your client uses an older version, split this into a manual step.

## Non-LLM integrations (lines 74–81)
- Library + per-client encrypted credential storage are implemented (`src/lib/integrations/*`, migration 019).
- **No operator UI exists** to create/rotate/delete integration credentials, and **no integration test console** is wired. The lib functions are callable from the agent or server actions but nothing yet calls them in production flows.
- Agent-side tool plumbing (so the engine can invoke these read-only fetches mid-turn) is **not yet implemented** — the agent does not call any integration. Today these are libraries waiting for a caller.

## Bulk escalation (line 90)
- API endpoint accepts `bulk_claim`, `bulk_assign`, `bulk_resolve` actions; `escalations.assigned_to_user_id` is added (migration 021).
- **No UI** uses these actions yet. The escalation list pages still only render single-row claim/resolve. Wire a multi-select + bulk-action toolbar in `src/app/operator/escalations/page.tsx` and `src/app/client/escalations/page.tsx`.

## Monthly check-in report (line 92)
- Generator + CLI script exist (`pnpm monthly:report --client <id>` or `--json`).
- **No UI** surfaces the report. No scheduled job triggers it monthly. To productize: add an operator route that runs the generator on demand, or a cron entry that emails/Slacks the result.

## Trace view (line 132)
- Per-conversation trace page at `/operator/clients/[clientId]/conversations/[conversationId]/trace`.
- Uses only existing data sources (`messages`, `agent_usage_events`, `escalations`, `reviews`). **No dedicated `agent_traces` table** — there is no record of retrieval scores, prompt hashes, latency, or provider failover branches beyond what already lives in `messages.metadata` and `agent_usage_events.metadata`. If deeper LangSmith-equivalent traces are needed, add a persistent `agent_traces` table and emit from `lib/agent/engine.ts`.

## Doc-shaped TODOs (lines 85, 94–115, 117, 134–147)
Marked done per the skip-docs directive on 2026-06-11. No content was written. If any of these later need real artifacts (pricing decision doc, GTM checklists, Phase go/no-go criteria, SEA expansion notes, etc.), they will need to be authored from scratch — the line being checked off only reflects the skip directive, not delivery.

## Test coverage
No new Vitest suites were added for: integrations adapters, v2 channel adapters, bulk escalation, monthly report, or trace aggregator. Existing 172 tests continue to pass. New code is exercised only by typecheck.

## Mock vs real
- `PRONTO_USE_MOCK_AI=1` is a real, intentional mock provider, not a stub. Keep it for local dev. Production must set `0` and the preflight enforces it.
- Channel webhooks fall back to permissive signature checks when the corresponding secret env is missing **and** `NODE_ENV !== "production"`. This is intentional for local testing; production deploy must set the secrets.
