# Known Stubs and Partial Wiring

Tracks items marked done in `TODO.md` whose implementation is intentionally partial. Add a line here whenever you complete a feature with a known gap so the next agent does not assume full coverage.

## Configuration-blocked (real keys required)
- **Live OpenAI/provider keys** (TODO line 1) — readiness UI + preflight exist; no live key is wired in this checkout.
- **Live Meta WhatsApp app** (TODO line 2) — webhook + send code is real; needs `appSecret`, `accessToken`, `phoneNumberId`, `verifyToken`.
- **Live Telegram bot** (TODO line 3) — webhook + send code is real; needs `botToken`, `webhookSecret`, public HTTPS tunnel.
- **Live v2 channel credentials** — Messenger, Instagram, Email (Postmark/Resend) adapters and webhook routes are real; need real `pageAccessToken`, `appSecret`, `verifyToken`, IG user ID, Postmark/Resend API token, from-address, webhook secret.

These four bullets are marked done because all in-repo code is implemented. Only ops configuration is missing.

## Migration safety
- `db/migrations/020_v2_channels.sql` uses `ALTER TYPE … ADD VALUE IF NOT EXISTS`. Works on Postgres 12+. On older versions, split into a manual step.
- `db/migrations/022_agent_traces.sql` adds a new table; safe to apply incrementally.
- `db/migrations/023_email_suppressions.sql` adds bounce/complaint suppression table.

## Email robustness (added 2026-06-11)
- **Threading by RFC headers.** Inbound parses `Message-Id`, `In-Reply-To`, `References` (Postmark `Headers` array + Resend `data.headers`). Thread resolution: search prior inbound (`messages.external_message_id`) and outbound (`messages.metadata.outgoingMessageId`); falls back to `In-Reply-To`, then subject, then from-address. Outbound replies set `Message-Id`, `In-Reply-To`, `References` headers and persist the outgoing Message-Id on the agent message so future customer replies thread correctly.
- **Auto-responder suppression.** Skips inbound when `Auto-Submitted` ≠ `no`, when `Precedence` is `bulk|list|junk|auto_reply`, when `List-Unsubscribe` is present, or when subject matches "Out of office" / "Automatic reply" / "Auto-reply" / "Away from office".
- **Attachment detection.** Postmark `Attachments` and Resend `attachments` are parsed; attachment-only mails are normalized with `unsupportedMediaType: "email_attachment"` (engine escalates); text+attachment mails preserve text and note ignored files.
- **HTML→text fallback.** When `TextBody` is empty but `HtmlBody` exists, `stripHtml` extracts readable text (block tags become newlines, entities decoded, scripts/styles removed).
- **DMARC/SPF/DKIM check.** Parses `Authentication-Results`; if any of `spf|dkim|dmarc` are `fail|softfail|policy`, the message is normalized with `unsupportedMediaType: "email_auth_failed"` so the agent escalates rather than answering a spoof.
- **CC capture.** Postmark `CcFull` and Resend `cc` are parsed into the message's `raw.parsed.cc` array.
- **Bounce / spam complaint webhook.** New route `POST /api/webhooks/email/[channelId]/events`. Postmark `RecordType: Bounce|HardBounce|SpamComplaint|Delivery` and Resend `email.bounced|email.complained|email.delivered` are handled. Bounces/complaints (1) write to the new `email_suppressions` table (unique per `client_id + email_address`), (2) update the matching `outbound_messages` row to `status='failed'` with the bounce reason stored in `metadata.deliveryFailure`.
- **Suppression list enforcement.** `sendEmail` checks `email_suppressions` before each send and throws if the recipient is suppressed — prevents loops with broken addresses.
- **Auto-response loop guards.** Every outbound carries `Auto-Submitted: auto-replied` and `X-Auto-Response-Suppress: All`, so reciprocal autoresponders see we're already automated and (per RFC 3834) shouldn't reply.

## Resolved on 2026-06-11
- v2 channel inbound webhook routes — `src/app/api/webhooks/{messenger,instagram,email}/[channelId]/route.ts` now exist with the same signature/secret/rate-limit/redaction pattern as WhatsApp and Telegram. Health checks and config validators in `lib/channels/health.ts` branch on all five channel kinds. `lib/channels/process.ts` now sends the escalation holding reply on every non-console channel kind.
- Integration credentials operator UI — `src/app/operator/clients/[clientId]/integrations/page.tsx` lists current credentials, lets the operator save / rotate / delete, and provides an integration test console (`POST /api/operator/integrations/test`). Credentials API lives at `POST/DELETE /api/operator/integrations`.
- Agent tool plumbing for integrations — `src/lib/agent/integration-tools.ts` detects intents (order lookups, tracking, SKU stock, booking) via regex, calls the matching integration only when credentials exist, and feeds the result back to the agent as a high-score knowledge chunk marked `live_source: true`. The engine in `lib/agent/engine.ts` invokes this after retrieval and records the invocation as a trace step.
- Bulk escalation UI — `src/components/bulk-escalation-list.tsx` (client component) drives multi-select claim/assign/resolve via the existing `/api/escalations` bulk actions. The three previous redirect pages (`/operator/escalations`, `/operator/clients/[id]/escalations`, `/client/escalations`) are now real list pages.
- Monthly check-in report UI — `src/app/operator/clients/[clientId]/monthly-report/page.tsx` renders the report on demand with an "As of" date selector; `GET /api/operator/monthly-report?clientId=…&asOf=…` returns the JSON for programmatic callers; `pnpm monthly:report` script still works for CLI.
- Persistent agent traces — new `agent_traces` table (migration 022) captures every agent run with provider, model, retrieval top score, retrieval threshold, retrieved chunk scores (jsonb), cited chunk ids, SHA-256 prompt hash, failover provider/model/reason, latency_ms, error_message, and an ordered `steps` jsonb array. `lib/agent/trace.ts` exports `AgentTraceBuilder`; the engine instantiates one per run and finalizes it on every return path. `lib/trace.ts` reads from the new table and feeds the existing `/operator/.../trace` page, which now also renders per-run cards with retrieval, latency, prompt hash, and failover indicators.

## Test coverage
- 196 Vitest tests pass (24 new): Messenger / Instagram / Email normalize + signature, integration intent detection, integration adapter URL construction, bulk escalation tx behavior, monthly report formatting and window.
- Not covered by unit tests: webhook route handlers (existing routes weren't either), operator pages (existing convention), the trace page (existing convention).

## Mock vs real
- `PRONTO_USE_MOCK_AI=1` is a real, intentional mock provider, not a stub. Keep it for local dev. Production must set `0` and the preflight enforces it.
- Channel webhooks fall back to permissive signature checks when the corresponding secret env is missing **and** `NODE_ENV !== "production"`. This is intentional for local testing; production deploy must set the secrets.
- Integration adapters return `{ data: null, warning: "...not configured" }` when no credential exists. The agent simply skips them in that case; the customer flow falls back to static retrieval.

## Doc-shaped TODOs (lines 85, 94–115, 117, 134–147)
Marked done per the skip-docs directive on 2026-06-11. No content was written. If any of these later need real artifacts (pricing decision doc, GTM checklists, Phase go/no-go criteria, SEA expansion notes, etc.), they will need to be authored from scratch — the line being checked off only reflects the skip directive, not delivery.
