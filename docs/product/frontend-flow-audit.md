# Frontend and product-flow audit

Reviewed 12 October 2026. Scope: the existing Next.js pages, shared navigation, forms, and local browser smoke tests. This is an audit of the product interface; it does not establish that any external messaging account is live. The PS.Cafe Raffles City tenant remains an internal demonstration, and its unapproved voice and unresolved reservation cutoff must not be presented as official restaurant policy.

## The job the interface should help people do

1. An operator creates a business, adds its knowledge, connects a customer channel, checks the connection, and monitors failures.
2. A business user reviews facts and handoff rules, previews an answer, publishes changes, and replies when a customer needs a person.
3. A customer gets a grounded answer or a clear human handoff. The customer feedback screen asks for a rating and an optional comment.

The current interface supports all three paths. The strongest flow is the business inbox to conversation to human reply. Initial setup was harder to discover: the business overview showed counts and a generic setup warning, and integrations had a route but no direct operator workspace tab. Both are addressed below.

## Screen inventory and disposition

| Screen or route | Current job | Disposition / UX assessment |
|---|---|---|
| `/` | Redirect by role | Keep; no additional home screen needed for this authenticated workspace. |
| `/login` | Sign in | Keep. Product explanation added; seed account credentials removed from the page. |
| `/client` | Business overview | Keep. Ordered knowledge → channel → preview path and human reply priority added. |
| `/client/inbox` | Conversation queue | Keep; the needs-reply filter is the main daily task. Advanced filters still take significant space. |
| `/client/conversations/[conversationId]` | Read thread and reply during handoff | Keep. Thread and action panel are side by side on wide screens. |
| `/client/escalations` | Redirect to needs-reply inbox | Keep as a compatibility route; a separate escalation screen would duplicate the inbox. |
| `/client/assistant` | Preview and publish assistant changes | Keep. Renamed in navigation to “Test & publish”; required setup distinguished from optional tuning. |
| `/client/knowledge` | View and add answer sources | Keep. Source drafts and live facts remain distinct. |
| `/client/knowledge/[sourceId]` | Edit or remove one source | Keep; necessary for correcting stale facts. |
| `/client/assistant/voice` | Edit response style | Keep as optional setup. Do not present a demo voice as restaurant-approved. |
| `/client/assistant/rules` | Configure handoff rules | Keep as optional setup; default rules still operate. |
| `/client/assistant/channels` | Add, check and publish a channel | Keep. This form is dense and still needs provider-specific prerequisites and clearer connection evidence. |
| `/client/settings` | Business location and handoff contacts | Keep. Inputs now have persistent labels; channel-specific contact fields remain limited. |
| `/operator` | See business portfolio and health | Keep. Channel count now separates active channels from those needing review. |
| `/operator/conversations` | Choose a business inbox | Candidate for eventual consolidation with the portfolio if operators mostly work from one list; keep while usage is unknown. |
| `/operator/escalations` | See handoffs across businesses | Keep; added to primary operator navigation. |
| `/operator/clients/new` | Create business and first user | Keep. Intro now explains the user task instead of implementation details. |
| `/operator/clients/[clientId]` | Business launch and operations overview | Keep. Next-action links lead to missing knowledge, channels, handoffs and failures. |
| `/operator/clients/[clientId]/channels` | Set credentials, webhook and health | Keep; technical setup belongs to operators. Form remains long, and health does not prove real message delivery. |
| `/operator/clients/[clientId]/integrations` | Configure business-system credentials | Keep; linked in the main business navigation. |
| `/operator/clients/[clientId]/knowledge` | Add and review answer sources | Keep; needed for managed onboarding. |
| `/operator/clients/[clientId]/knowledge/[sourceId]` | Edit one source | Keep. |
| `/operator/clients/[clientId]/conversations` | Business conversation queue | Keep. |
| `/operator/clients/[clientId]/conversations/[conversationId]` | Read context and handle a handoff | Keep. Thread now precedes the reply controls, matching the business view. |
| `/operator/clients/[clientId]/escalations` | Bulk handoff assignment and resolution | Keep for operator workload; should remain distinct from individual conversation handling. |
| `/operator/clients/[clientId]/flows` | Raw triage JSON editor | Keep available to trained operators under “More settings”; it is too technical for primary navigation. |
| `/operator/clients/[clientId]/users` | Staff access | Keep under “More settings”. |
| `/operator/clients/[clientId]/offboarding` | Export or delete business data | Keep under “More settings”, away from daily actions. |
| `/csat/[conversationId]` | Customer rating | Keep. Branding changed from “Pronto feedback” to “Customer feedback”. |
| Error and not-found pages | Recovery | Keep; review these with actual failures before further redesign. |

## Findings, ranked by impact

| Priority | Finding and evidence | Action |
|---|---|---|
| High | The login page said “Pronto MVP” and showed seed credentials outside production (`src/app/login/page.tsx`). It did not explain the customer-service outcome. | Added a plain-language purpose statement and three concrete capabilities; removed account credentials from UI. Test accounts remain in test documentation. |
| High | The business overview offered a generic setup warning without an ordered path (`src/app/client/page.tsx`). | Added linked steps for knowledge, channel and response preview. The status says “Configured” rather than implying live delivery. |
| High | Operators could reach integration credentials only through a route or indirect link; cross-client handoffs were absent from primary navigation (`src/components/operator/operator-nav.tsx`, `src/components/shell.tsx`). | Surfaced Integrations and Handoffs; grouped raw flow, user and offboarding controls under “More settings”. |
| Medium | Operator conversation detail put the action panel before customer context (`src/app/operator/clients/[clientId]/conversations/[conversationId]/page.tsx`). | Moved the thread first and placed action controls beside it on wide screens. |
| Medium | Assistant setup labeled optional voice and custom rules as incomplete; version numbers and “live revision” exposed internal concepts (`src/app/client/assistant/page.tsx`). | Labeled required and optional items, placed “Test & publish” after setup tasks, and replaced the version badge with publish state. |
| Medium | The mobile header had both a menu and horizontal navigation plus a role link back to the current section (`src/components/shell.tsx`). | Kept a single visible navigation row and sign-out control. |
| Medium | Connection state is still easy to misread as provider verification. “Active” and health checks do not prove Meta delivery or a real mailbox (`src/app/client/assistant/channels/page.tsx`, `src/components/operator/operator-panels.tsx`). | Keep explicit activation review. A future UI pass should show distinct configuration, webhook, send and delivery evidence per provider. |
| Medium | Business inbox filters are all visible even when the usual task is “Needs reply” (`src/components/reporting-panels.tsx`). | Keep current filters for functionality; consider collapsing advanced fields after observing operator use. |
| Low | The operator overview still gives Chope booking-link setup equal visual weight to message delivery and handoffs (`src/app/operator/clients/[clientId]/page.tsx`). | Keep the working control, then consider moving it to Integrations when reservation settings grow. |

## Copy and trust rules

- Do not put implementation terms such as MVP, fixture, mock, seed credentials, environment variable names or revision numbers in ordinary business or customer flows. The response-mode banner now explains simulated answers in plain language.
- Keep operational uncertainty visible. A configured channel, an AI preview, a local email capture and a provider-accepted send are different states.
- Keep PS.Cafe demo provenance and the 5:30 pm versus 6:00 pm reservation cutoff conflict in the knowledge workflow. Do not smooth over the conflict in UI copy.
- Do not imply that an availability result is a confirmed reservation, or that a booking link completes a booking.

## Follow-up product decisions

1. Decide what evidence must be shown before a channel can be called “ready for customers”; the current channel health data is not an external delivery guarantee.
2. Decide whether the cross-client conversation selector should remain separate from the portfolio after real operator usage is observed.
3. Add provider-specific setup guidance and progress to the long channel forms when real account activation becomes available.
4. Test the revised navigation and labels with a business owner and a Pronto operator. Code and browser checks cannot establish task-completion speed or comprehension.
