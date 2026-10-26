# Business experience (Tranche B)

Pronto's operator console remains the primary management workspace. The business portal is a secure fallback for human handoff, review and preferences. Customers do not need Pronto accounts. The PS.Cafe Raffles City tenant is an internal demonstration, not an official restaurant account.

## Business navigation

| Destination | Route | Purpose |
|---|---|---|
| Inbox | `/client/inbox` | All conversations, needs-reply and resolved filters, attention-first or most-recent sorting. Claim, reply and release through the existing thread. |
| Business Knowledge | `/client/knowledge` | Five cards: knowledge sources, customer channels, brand voice, handoff rules, and testing and publication. Source import and correction actions open dialogs from the Knowledge card header; the other editors expand within their card. |

`/client` opens Inbox for responders; `/client/activity` redirects to its most-recent view. The sidebar and mobile navigation contain only Inbox and Business Knowledge. The former assistant setup tab row is removed. `/client/assistant`, `/client/assistant/voice`, `/client/assistant/rules` and `/client/assistant/channels` redirect to the matching card on Business Knowledge. Save and connection-check forms return to that card. Approval and conversation deep links remain available within their workflows. Connected Channels, Contact Pronto and Settings pages have been removed. The workspace uses light mode. A notification link requires sign-in and tenant-scoped conversation access. Channel secrets remain masked in the connection editor; raw jobs and provider diagnostics stay in the operator console.

## Capabilities

Grants are tenant-scoped in `staff_permission_grants`; migration 036 adds `escalation.policy.manage` without a backfill. The generic client role has no privileged grant. An operator manages technical activation and final publication but cannot stand in for business approval.

| Capability | Allowed business action | Does not imply |
|---|---|---|
| `conversation.respond` | View, claim and reply to authorized conversations | Knowledge or channel approval |
| `conversation.release` | Resolve/release a human handoff back to AI | Policy changes |
| `knowledge.approve` | Review exact knowledge suggestion and assistant revision | Publication or channel activation |
| `channel.activate` | Approve a customer channel revision | Technical activation or knowledge approval |
| `escalation.policy.manage` | Save an optimistic-version policy change | Conversation or channel authority |
| `staff.permissions.manage` | Manage scoped staff grants with evidence | Automatic access to the other capabilities |

All privileged writes are checked server-side. Revoking a grant prevents a pending local command from confirming. A public customer message, displayed sender name or claimed email address is never an authorized staff identity.

## Knowledge correction lifecycle

The source list combines published documents with pending imports and proposed facts. Updates to an existing source appear on that source's detail page, with links to their exact review revision. There is no separate Changes and reviews section. New sources, extraction failures and unanswered questions remain reachable from the same list. `/client/knowledge/reviews/{submission|suggestion|question}/{id}` requires a signed-in business account and loads only records for its tenant; approval controls require `knowledge.approve` and the API rechecks that capability and revision.

Opening a conflicting source shows its recorded statements and original references immediately. The comparison labels both statements unverified; it does not choose a correct value. Proposed updates show a line comparison between the current document and the submitted revision. Source text is read-only by default, with revision and archive proposals available below it.

1. Any signed-in business member proposes a title, answer/policy, reason, optional existing source, source reference and outlet. A request key deduplicates retries. The proposal and its revisions live in `knowledge_suggestions` and `knowledge_suggestion_revisions`, not active RAG sources.
2. A `knowledge.approve` business member approves, rejects or requests a revision of the exact pending revision with a review note. A new revision clears the old review. Cross-tenant and stale-revision requests fail.
3. A Pronto operator stages a reviewed version into the existing `assistant_drafts` service. The operator privately tests the current assistant revision. A business knowledge approver approves that exact assistant revision with evidence, and the operator explicitly publishes. These are separate review and publication gates. The published source/version retains suggestion ID, available author identity, reason, supporting reference, outlet and approval provenance. The existing RAG index updates only on publication.
4. A material change after approval needs a new proposal/revision. A legacy draft or publish route cannot turn a pending suggestion into customer knowledge.

If the business reviewer account is deleted before staging or publication, the
approval identity is no longer available and the correction fails closed. A
current authorized reviewer must review a new proposal. Existing audit records
follow the application's user-deletion retention rules.

The PS.Cafe 5:30pm versus 6:00pm weekend reservation cutoff conflict remains unresolved. A synthetic proposal may describe the conflict, but the demo must not treat either cutoff as the restaurant's approved fact.

## Local staff interaction

The Contact Pronto page has been removed. `/api/client/staff-interaction` remains a **local-only** backend test endpoint. Set `PRONTO_LOCAL_STAFF_COMMANDS=1` in a nonproduction app connected to the marked disposable test database. The production-mode Playwright harness additionally requires `PRONTO_LOCAL_STAFF_E2E=1` and identical loopback `DATABASE_URL`/`PRONTO_TEST_DATABASE_URL` pointing to `/pronto_test`. No live channel adapter calls this service. Avoid enabling the local flag on a shared development database.

Supported deterministic requests:

- `Show escalation policy` or `View escalation response target` reads the current settings.
- `Change our escalation response target to 30 minutes` (or `unset`) proposes a version-bound change; only `escalation.policy.manage` may submit and confirm it.
- `Suggest knowledge: Title | Proposed answer | Reason | Source` proposes a pending correction after explicit confirmation. The source segment is optional.

The server derives actor and tenant from the authenticated session and rechecks the current user row. A proposed mutation stores a token hash, actor, tenant, command, request key, base policy version and ten-minute expiry in `staff_command_requests`; the one-time token stays in browser memory. Confirmation rechecks identity, capability, token, expiry and current revision in a transaction. Replays return the already-applied result without repeating the change. Audit records capture proposals and results. No LLM text authorizes execution. Activation, credential updates, permission grants, free-form administration and real WhatsApp/Instagram/email staff commands are unsupported. Provider-specific sender proof, account authorization and messaging-window checks are prerequisites for future live staff interaction.

## Escalation policy and operational limits

The existing versioned policy API and authorized operator workflow retain response target, staffed hours, timezone, verified destination references, reminder preference, backup destination and out-of-hours acknowledgement settings. The business Settings page has been removed. The target is optional and is not a guaranteed SLA. Tranche C schedules verified staff reminders and backup notifications through the existing worker; see [source review and timed notifications](knowledge-and-reminders.md). The existing durable initial notification and secure handoff link remain active. Real inference mode does not send a configured canned acknowledgement to the customer.

`036_business_interaction.sql` adds the narrow permission, suggestion/revision tables and local command table. `037_business_interaction_user_deletion.sql` keeps history when a synthetic author/reviewer is removed. Neither migration grants existing users new authority or activates channels. Apply only with `pnpm migrate:test` after `pnpm test:db:verify` against the marked disposable database; production migration requires a separate review. The audit trail and source versions should be retained according to the deployment's data-retention policy.

## Local verification

Follow [safe regression baseline](../testing/safe-regression-baseline.md) for the marked database and guarded environment. Then run `pnpm test:db`, `pnpm test:local-mail` (with Mailpit), `pnpm lint`, `pnpm typecheck`, guarded `pnpm build`, and `pnpm test:e2e`. The [PS.Cafe demo guide](../demos/local-mvp.md) lists synthetic staff identities and the Mailpit handoff. These checks verify local behavior only; Meta messaging and real business staff command delivery remain blocked pending provider setup and authorization.
