# Operator administration without the HQ frontend

The business UI remains at `/client/inbox`; the development customer simulator
remains at `/demo/customer`. Operators sign in to `/account`. They do not acquire
a business role by opening the business inbox. Use an authorized business account
in a separate browser profile/private window when both roles are needed.

The obsolete `/operator` pages have been retired under PRON-87. Administrative
services, database functions, approvals and worker controls remain in the same
application. `pnpm admin` authenticates through `/api/auth/login` and calls the
existing protected APIs. It does not connect directly to PostgreSQL, mint a
session, impersonate a tenant, or grant itself permissions.

## Authenticate and inspect

Run from the repository in a terminal, with the local application running:

```sh
pnpm admin login --base-url http://localhost:3000
pnpm admin inspect clients
pnpm admin inspect client --client-id BUSINESS_UUID
pnpm admin inspect knowledge --client-id BUSINESS_UUID
pnpm admin inspect channels --client-id BUSINESS_UUID
pnpm admin inspect configuration --client-id BUSINESS_UUID
pnpm admin inspect conversations --client-id BUSINESS_UUID --offset 0
pnpm admin inspect conversation --client-id BUSINESS_UUID --conversation-id CONVERSATION_UUID
pnpm admin inspect source --client-id BUSINESS_UUID --source-id SOURCE_UUID
pnpm admin inspect operations
pnpm admin logout
```

Login prompts for email and a hidden password. Do not put passwords in command
arguments or ChatGPT. For automation, `login --credentials-file /private/login.json`
accepts a locally prepared JSON object with `email` and `password`, owned by the
current user with mode 600. Delete that input when finished. This is optional;
interactive login does not require a credential file.

Session files default to `~/.local/state/pronto/operator-<origin-hash>.json`,
mode 600. `--session-file` overrides the location. Never share these files or
include them in logs. A session is pinned to its application origin and checked
against the application's current user/session version on requests. HTTP is
accepted only on loopback; other origins require HTTPS. No deployment is implied.

Conversation inspection includes the current actionable/closed escalation and
owner-reply delivery evidence, so operators can use its scoped escalation ID for
the retained response/retry/release API without needing database access.

Inspection responses contain business information. Prefer
`--output-file /private/review.json` when saving them; this creates a mode-600
file. The inspection API is operator-only and sends `Cache-Control: private,
no-store`. It omits password hashes and channel credentials. Sensitive settings
are redacted. Business account login to this CLI is rejected.

## Submit an administrative action

Create a private directory and files locally. These are examples with placeholders,
not commands to run against an unidentified business:

```sh
umask 077
mkdir -p /tmp/my-pronto-admin
# Prepare /tmp/my-pronto-admin/action.json locally, mode 600.
pnpm admin request /api/operator/onboarding \
  --form-file /tmp/my-pronto-admin/action.json \
  --output-file /tmp/my-pronto-admin/result.json
```

`--form-file` accepts a JSON object whose values are strings (or arrays of strings
for repeated fields such as `escalationIds`) and sends
multipart form data, matching the former forms. Serialize structured fields such
as `policy`, `nodes`, `settings` or `escalationRules` as JSON strings. Endpoints
that consume JSON use `--json-file` instead. A selectable-text PDF can accompany
the knowledge form with `--upload /private/source.pdf` (mode 600, at most 10 MB).

`request` defaults to POST. Integration credential removal uses
`request /api/operator/integrations --method DELETE --json-file /private/remove.json`.
Only POST and DELETE mutations are supported; reads use `inspect`.

Mutations return JSON success/error responses instead of redirects to retired
pages. The CLI never follows redirects or automatically retries writes. After a
timeout, inspect current state and audit evidence before repeating an action.
Existing idempotency keys and expected revision/version fields still apply.
Do not retry a provider send merely because its delivery outcome is uncertain.

## Essential workflows and boundaries

| Task | Endpoint / fields | Existing gate retained |
|---|---|---|
| Create draft business | `/api/operator/clients`: `name`, optional `slug`, `vertical`, `planTier`, `brandVoice`, and all three `initialUserName`, `initialUserEmail`, `initialUserPassword` if creating staff | Operator sign-in; starts draft; password hashing; transactional audit |
| Staff creation/removal | `/api/operator/clients/ID/users`: `name`, `email`, `password`, `role`; `/api/operator/clients/ID/users/USER_ID/delete` with an empty form object | Existing role validation and self-removal protection |
| Delegate staff capabilities | `/api/operator/clients/ID/permissions`: `userId`, `capability`, `action=grant` or `revoke`, `evidence` | Explicit evidence, business membership and existing capability validation |
| Prepare onboarding | `/api/operator/onboarding`: `clientId`, `stage`, `action=save` or `submit`, `revision`, `detail.FIELD`, `evidence.FIELD`, optional `blockers`, `responsibleUserId`, `notApplicableReason` | Current revision, required fields and preceding stages |
| Finish activation | Same endpoint: `stage=activation`, `action=activate`, current `revision` | Business-approved stages and explicitly approved/operator-activated channel |
| Ingest knowledge | `/api/operator/knowledge`: `clientId`, `title`, `content` or `sourceUrl`, optional `description`, `outletName`, `requestKey`; optional PDF upload | Existing extraction/URL safeguards; creates pending submission |
| Stage approved source | `/api/operator/knowledge-submissions`: `clientId`, `submissionId`, `revision` | Exact revision needs an authorized **business** knowledge approval |
| Stage approved correction | `/api/operator/knowledge-suggestions`: `clientId`, `suggestionId`, `revision` | Existing business reviewer identity and current revision |
| Update/archive source | `/api/operator/knowledge/SOURCE_ID`: `clientId`, `action=update` with `title`, `content`, or `action=delete` | Creates a draft; publication approvals still apply |
| Test draft | `/api/operator/assistant-test`, **JSON**: `clientId`, `channelId=preview` (or scoped channel ID), `message`, optional `history` | Existing private preview; marks the tested draft version; no customer send |
| Publish assistant | `/api/operator/assistant/publish`: `clientId` | Current tested draft plus independent business approval |
| Channel configuration | `/api/operator/channels`: `clientId`, `channelId`, `status`, `externalId`, `settings`, `credentials` or structured fields | Existing encryption and active-channel draft gates |
| Channel health | `/api/operator/channel-health`: `clientId`, `channelId` | Existing provider checks; do not run live checks without permission |
| Record activation evidence | `/api/operator/channels/activation`: `clientId`, `channelId`, `revision`, `action=evidence`, `checkKind`, `details` | Current revision; evidence must describe actual authorized verification |
| Activate channel | Same endpoint with `action=activate`; active edits use `check_draft` then `publish_draft` | Independent business `channel.activate` approval, health, evidence and onboarding checks |
| Staff notifications/policy | `/api/operator/staff-configuration`: `clientId`, `action=destination` with destination identity/evidence fields, or `action=policy`, `expectedVersion`, serialized `policy` | Verified recipient identity, audience, policy version and permissions |
| Agent tuning / voice / flow | `/api/operator/agent-config`, `/brand-voice` use forms; `/api/operator/flows` uses **JSON** with `clientId`, `nodes`, `edges` | Existing staged-edit services; inspect `configuration` and corresponding route schemas before submitting |
| Integration credentials/test | `/api/operator/integrations`, `/integrations/test`, **JSON** | Existing encrypted credential storage and provider opt-ins; not an authorization to contact providers |
| Chope restaurant mapping | `/api/operator/clients/ID/chope-link`: `action` and existing mapping fields | Existing restaurant validation; no new live-read permission or booking writes |
| Retry/acknowledge operations | `/api/operator/inbound-jobs/ID/retry`, `/staff-notifications/ID/retry`, `/errors/ID/acknowledge` | Existing scoped IDs, reconciliation evidence and audit records |
| Escalation operations | `/api/escalations` with existing action schema | Existing role, tenant, response and release permissions; operator ability does not grant a business UI session |
| Export/offboard | `/api/operator/offboarding`: `clientId`, `action=export`; deletion separately requires `action=delete`, exact `confirmSlug` | Existing explicit deletion confirmation and audit; never use during startup/testing of persistent databases |

The retained route implementations are the authoritative schemas for less common
fields. This CLI is an authenticated transport to those routes, not a new
administrative policy layer.

### Approval sequence

1. Operator prepares/submits onboarding or a knowledge/channel draft via CLI.
2. An authorized business reviewer signs in separately to the retained business
   portal. Onboarding approvals are at `/client/approvals`; source/assistant
   approvals at `/client/knowledge`; channel approvals at `/client/approvals`.
3. Operator inspects the current version, runs the private assistant preview or
   authorized channel check, and stages/publishes/activates using the existing API.

Operators cannot substitute for business approval. `knowledge.approve` and
`channel.activate` remain independent delegations. Do not approve your own
operator actions by creating an unauthorized business identity.

The guarded Playwright CLI acceptance test uses a fresh synthetic business in the
marked disposable database, separate business authentication and local-SMTP-only
channel evidence. It proves local administrative reachability and gate behavior;
it does not establish real-provider activation or production readiness.


## Protected Vercel access

Pronto operator authentication remains required behind Vercel account protection.
If an approved deployment requires an automation bypass, configure server-only
`PRONTO_VERCEL_PROTECTION_BYPASS` and pin the exact HTTPS origin in
`PRONTO_VERCEL_PROTECTION_ORIGIN` in the private CLI environment. The CLI sends
this platform header only to that origin and never follows redirects. It does
not grant any Pronto capability. Always pass the same `--base-url` to login,
inspect, request and logout. See [the hosted runbook](../setup/vercel-demo.md).
