# Managed operations and onboarding (Tranche A)

Pronto's primary web workspace is the internal operator console. It uses the existing Next.js application and PostgreSQL workers. Customer messages still follow the same authenticated webhook → durable inbox → worker → tenant RAG/agent → durable outbox path. The PS.Cafe tenant remains an internal demo; it is not an approved restaurant messaging account.

## Operator navigation

| Destination | Route | Action |
|---|---|---|
| Overview | `/operator/overview` | Fleet attention and job failures. Portfolio health is explicitly a setup heuristic. |
| Businesses | `/operator` | Search businesses, create a draft business, and open its next onboarding step. |
| Inbox | `/operator/conversations` | Search/filter the cross-business conversation queue; drill down to existing threads and handoff controls. |
| Knowledge & Connections | `/operator/knowledge-connections` | Review pending drafts, flagged sources, customer-channel state and integration credential presence. |
| Operations | `/operator/operations` | Worker heartbeat; inbound, outbound and staff-notification queue status; uncertain sends and sanitized error events. |

Existing tenant URLs remain available. The sidebar's create shortcut goes to the canonical `/operator/clients/new` form. Detailed readiness is operator-only in Operations; public `/api/readiness` returns only `ready` or `not_ready` with HTTP 200/503 and `Cache-Control: no-store`.

## Five-stage onboarding

`onboarding_stages` tracks `profile`, `communications`, `knowledge`, `testing` and `activation` independently of `clients.status`. The migration backfills existing businesses with **draft** stages and grants no staff permissions. New businesses also begin as draft. Operators save or submit a stage in `/operator/clients/[clientId]/onboarding`; an authorized business staff member reviews submitted revisions in `/client/approvals`. Every save increments the revision and clears prior stage approval. Submission checks required fields, unresolved blockers and preceding approved stages. Stale submissions/approvals fail server-side.

1. **Profile & discovery:** business name, timezone, service scope, source review.
2. **Communication preferences:** customer channel choices and staff notification preferences are separate; record account/permission progress and identity review.
3. **Knowledge & assistant rules:** scope, sources, escalation rules and conflict decisions.
4. **Private testing & approval:** local test plan and handoff evidence. Local/mock testing is not provider acceptance or recipient delivery.
5. **Activation & monitoring:** monitoring owner, rollback contact, business signoff and an explicitly reviewed active channel. The operator must perform the final activation.

The stage UI records optional `not_applicable` rationale, blockers, responsible user, evidence, approver and timestamp. The API validates transition order and optimistic revision. Publishing a changed assistant or channel configuration requires a new approval of that exact revision. Existing live channels are not automatically deactivated or reapproved by this migration; they require review before future activation changes.

## Authority and publication

`staff_permission_grants` separates `knowledge.approve`, `channel.activate`, `conversation.respond`, `conversation.release` and `staff.permissions.manage`. `pronto.operator` is the existing operator role. A generic client account receives **none** of these capabilities, including pre-existing accounts. Pronto can grant a capability with recorded authorization evidence in the tenant Users screen; a granted business staff manager can delegate through Settings. All grants and revocations are tenant-scoped and audited.

Business approval is performed by a client-role user holding the matching capability. An operator cannot substitute for business approval. Assistant proposals—including knowledge, voice, triage flow and prompt tuning—stay in `assistant_drafts`. They require `knowledge.approve` business approval of the current revision with evidence, then explicit operator publication. The former private preview and tested marker have been removed; test model output through real customer conversations. Approved content becomes active RAG material only after publication. Each knowledge proposal records its author and source reference; source/version records retain provenance. A material edit increments the draft revision and invalidates the previous approval.

Customer-channel activation requires `channel.activate` business approval, revision-bound ownership/permission/test/provider/delivery evidence, a successful current health check, approved preceding onboarding stages and an explicit operator action. The local SMTP sandbox uses a narrower local evidence set and cannot activate in production. Provider API acceptance, recipient delivery and business approval are recorded separately. Editing an active channel to remain active stages a proposed revision; the live channel stays in service until that revision is checked and published. A health check by itself never activates a channel. A business user cannot publish even a nonactive channel draft.

Conversation detail and the business inbox require `conversation.respond` or `conversation.release`; actions check their own capability. The customer remains unauthenticated and never gets a Pronto account. Legacy client URLs still resolve for authorized tenant users.

## Staff contact and escalation policy

`staff_notification_destinations` is independent of customer-facing `channels`. Proposals cannot change WhatsApp, Instagram, Telegram or email customer settings. Enabling a destination requires operator verification evidence and a bound recipient user; business recipients need conversation access. New destination changes are audited.

`escalation_policy_versions` stores optional target minutes, staffed hours, timezone, initial/backup verified destinations, reminder intervals and out-of-hours acknowledgement, with an optimistic version check and audit. An unset response target is displayed as unset; it does not create an SLA. An authorized staff manager may update the policy after onboarding. Reminder and backup settings are retained for later automation; Tranche A does not send scheduled reminders or backup notifications.

Tranche B gives policy editing its own `escalation.policy.manage` grant. Existing managers, responders, knowledge approvers and channel activators do not receive it implicitly. Business staff with that grant can edit the existing versioned policy in Settings or use the guarded local command flow described in [the business experience guide](business-experience.md). The target is an operating preference, never a promised SLA. Tranche C schedules verified staff reminders and backups through the same durable worker; see [source review and timed notifications](knowledge-and-reminders.md).

The client portal has two primary destinations: Inbox and Business Knowledge. Inbox includes attention filters and recent updates; Business Knowledge groups sources, channels, brand voice and handoff policies into summary cards. The Channels, Brand voice and Handoff rules cards open separate detail pages with their existing controls. Legacy assistant setup URLs redirect to the overview or matching detail page. Approvals remain available through secure deep links; the separate Connected Channels, Contact Pronto and Settings pages have been removed. Business knowledge corrections use the existing assistant draft and managed publication gates; operators review approved suggestions in the existing Knowledge & Connections and tenant knowledge views. See [the business experience guide](business-experience.md) for the role matrix, revision lifecycle, and local test commands.

Escalation creation atomically enqueues one `staff_notification_jobs` row. The existing worker claims it with bounded retries. A definite failure retries with backoff; a skipped/missing destination becomes dead. A lease expiry or ambiguous provider outcome becomes uncertain and requires operator reconciliation before manual retry. Operators see these states in Operations. Notifications contain an action link, not customer message text or secrets. Verified business destinations receive `/client/conversations/[id]`; explicit operator destinations receive `/operator/clients/[clientId]/conversations/[id]`. Both require login and role/tenant checks. Legacy owner contacts use the business route unless their configuration explicitly declares the operator audience.

## Local acceptance

Use only the marked `pronto_test` database described in [safe regression baseline](../testing/safe-regression-baseline.md). Set both `PRONTO_TEST_DATABASE_URL` and `DATABASE_URL` to its identical loopback URL and `TMPDIR=/var/tmp`.

```sh
pnpm test:db:verify
pnpm migrate:test
pnpm test:db
PRONTO_RUN_DB_TESTS=1 pnpm test:coverage
pnpm lint
pnpm typecheck
PRONTO_USE_MOCK_AI=1 NODE_OPTIONS=--import=./tests/setup/network-guard.mjs PRONTO_TEST_ALLOW_BUILD_IPC=1 pnpm build
pnpm test:e2e
```

For the Mailpit path, set `PRONTO_LOCAL_EMAIL_ENABLED=1`, run `docker compose --profile local-mail up -d mailpit`, then `pnpm test:local-mail`. The [local MVP guide](../demos/local-mvp.md) has the interactive email injection and worker steps. Default tests block external network and use fake Meta/Chope transports. Local email is a loopback SMTP capture, not external mailbox verification. Do not use `pnpm worker`, `pnpm migrate`, `pnpm seed`, provider health actions or demo injection against a non-test database.

Technical alerting remains an infrastructure boundary: the application stores correlated error events and queue state but does not expose a public `/metrics` endpoint or claim Prometheus/Grafana integration.
