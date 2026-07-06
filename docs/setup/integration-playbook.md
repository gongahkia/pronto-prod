# Integration Playbook

Use this checklist for every new third-party integration (Google Calendar, Calendly, Shopify, WooCommerce, custom inventory, 3PL trackers, etc.). Pronto integrations are read-only in v1; mutating endpoints require explicit scope, contract, and review.

## 1. Scoping

Before writing code, agree with the client on:

- Concrete customer questions the integration will answer (e.g. "Is order #1234 shipped?", "Is 7pm Friday open?").
- Data fields exposed to the agent vs. redacted (PII, billing, internal SKUs).
- Hard scope boundary (read-only this release; no order mutations, no refunds, no calendar writes).
- Fallback when the integration is unreachable (escalate vs. cached answer vs. polite "checking" reply).
- Owner contact for credential rotation and API outages.

Capture decisions in the client's setup notes plus the contract scope-of-work.

## 2. Credential Collection

- Use the lowest-privilege scope the integration supports (read-only API key, restricted OAuth scopes, read-only Shopify Storefront/Admin tokens).
- Store credentials encrypted in `integration_credentials` keyed by `client_id` and integration name. Never commit credentials.
- Verify `PRONTO_SECRETS_KEY` is set in the target environment before saving — credentials are encrypted on write.
- Record credential expiry and rotation cadence in `docs/setup/<integration>.md`.

## 3. API Limits And Reliability

For each integration, document:

- Documented rate limit (requests/minute, requests/hour) and the response code returned when exceeded.
- Realistic concurrent-call ceiling for the client tier (Starter / Growth / Scale).
- Expected p50 / p95 latency.
- Retry policy: exponential backoff for 429/5xx, no retry for 4xx auth errors.
- Failure threshold: after repeated failures, fall back to escalation for that integration only.

## 4. Read-Only Tools

- Integrations expose a small set of named tools that the agent can call (e.g. `shopify.order_status`, `calendar.availability_for_window`).
- Tool inputs are validated with Zod schemas. Reject unknown fields.
- Tool outputs go through the same source-citation requirement as static knowledge: every claim derived from a tool must cite the tool call ID.
- No tool may mutate state in v1. Any future mutation tool requires a separate review against the AI policy in `docs/compliance/ai-policy.md`.

## 5. Error Handling

- Tool errors call `recordErrorEvent` from `src/lib/error-tracking.ts` with `source: "channel"` or a new source enum value.
- The agent's escalation path takes over when a tool fails: do not let a downstream 500 propagate to a customer reply.
- Distinguish user-fixable errors (invalid credentials, expired token) from transient ones (5xx, timeout) in the alert payload.
- Add a smoke check to `pnpm staging:preflight` that confirms credentials authenticate before launch.

## 6. Privacy And PDPA

- Do not log full tool responses. Apply the same redaction pattern as `src/lib/logger.ts` (phone numbers, bearer tokens, content keys).
- Strip fields that are not needed to answer the customer before storing or echoing back.
- Confirm the integration's data-processing terms align with the Pronto DPA (`docs/legal/`).

## 7. Client Signoff

Before launch, run a joint demo with the client covering:

- Three "happy path" customer questions answered through the integration.
- One "should escalate" case (e.g. ambiguous order number, no availability in window).
- One "integration down" case where the agent escalates cleanly.
- Confirmation that no out-of-scope action (refunds, cancellations, marketing) can be triggered.

Capture the signoff in the client's setup notes.

## 8. Post-Launch

- Add the integration to the monthly check-in agenda.
- Watch `error_events` filtered by `source` for the new integration in the first 14 days.
- Re-confirm credential validity 7 days before any documented expiry.

## Template Files

When starting a new integration, create:

- `src/lib/integrations/<name>/client.ts` — HTTP client with retry + redaction.
- `src/lib/integrations/<name>/tools.ts` — Zod-validated tool definitions.
- `tests/unit/integrations/<name>.test.ts` — happy path, rate limit, auth failure, integration down.
- `docs/setup/<name>.md` — credentials, scopes, rotation cadence, owner.
