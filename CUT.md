# CUT.md — Pronto Repository Scope Reduction

Standalone execution plan for reducing `pronto-prerelease` to match the current pitch-deck product scope. Written for an independent coding agent — no external context required. Read the "Preamble" and "Context" sections first, then execute steps in order.

---

## Preamble

You are a coding agent tasked with cutting scope from this Next.js/Postgres repo. The repo was built at an earlier planning stage and now overshoots the current product vision. Your job is to remove features, code, dependencies, tests, and docs that are NOT part of the current pitch.

Do the cuts in the exact order listed. Each step notes which files/dirs to delete, which files to edit and how, and any sanity checks. A consolidation SQL migration is included verbatim. A final verification checklist confirms nothing is broken.

Ground rules:
- Never retroactively edit existing migrations 001–027. Add a new migration file to drop tables.
- Preserve tenant isolation, encrypted credentials, outbox reliability, and audit logging — they are compliance/security foundations.
- If typecheck/build breaks during a step, that's expected mid-flight. Finish the step's edits before running verification.
- Do not introduce new features or abstractions. Cut only.
- Do not use `git reset --hard` or force-push. Commit frequently on a dedicated branch.

---

## Context

Pronto is a "done-for-you" AI customer-service agent for SG SMEs (target verticals: F&B, retail). The current pitch (`Pronto for SMU BIG.pdf` at repo root) positions Pronto as **backend-native**: the Pronto team configures each client; the SME owner does not run a self-serve SaaS dashboard day-to-day. Pricing tiers are $200/mo (500 convos) or $650/mo (2000 convos), each with a $250 one-time setup. Currently piloting with 4 SG small businesses at $50/mo pilot pricing.

The repo, by contrast, ships:
- 6 messaging channels (Email, WhatsApp, Instagram, Telegram, Messenger, Console)
- 8 LLM providers with failover + circuit breaker
- Full self-serve client dashboard (10 pages)
- Operator "copilot" (multi-turn assistant with action proposals)
- Risk monitoring, monthly-report generation UI, QA review workflow, retention pruning, rate limiting, webhook replay, xyflow visual triage editor, provider-test console, alerts aggregation, etc.

Most of the above is over-built for the current stage (4 pilots, 3-person team) and misaligned with the "done-for-you, backend-native" positioning. The user has explicitly clarified:
1. `/client` dashboard STAYS but slimmed to the minimum needed to fulfill the PDF's 4 claims.
2. Cut the **Console** channel; keep the other 5 external channels (Email, WhatsApp, Instagram, Telegram, Messenger).
3. Cut the Website-scraping stub; keep all 6 live integrations (Shopify, WooCommerce, GCal, Calendly, Delivery, Inventory).
4. Cut anything else not necessary/core (agent's judgment).

## PDF Vision (Target State)

- 4 features: **RAG**, **Smart Triaging**, **Brand Voice**, **Omnichannel Deployment**
- Channels: Email, WhatsApp, Instagram DMs (PDF); Telegram + Messenger kept as extras per user
- Live data sources: FAQ/Policies (RAG), Live Inventory, Calendar, Delivery
- Service model: Done-for-you
- Roadmap: Pilot → Full Launch → First anchor client → Vertical expansion

## Guiding Principles for This Cut

- Prefer deletion over refactor.
- Preserve DB tables in old migrations; drop unused tables via ONE new migration.
- Preserve tests only for kept features.
- Leave a clean tree: no dead re-exports, no unused deps, no TODO comments referencing removed code.

---

## Prerequisites

1. Node 20+, pnpm 10+, Docker.
2. Working directory: repo root (`pronto-prerelease/`).
3. Read `README.md` and `docs/AGENT_CONTEXT.md` for repo layout.
4. Ensure clean git state.

```bash
git status                            # must be clean
git checkout -b chore/cut-scope
pnpm install
docker compose up -d
pnpm migrate
pnpm seed
pnpm dev                              # sanity: app boots at http://127.0.0.1:3000
# stop dev server; you have your baseline
```

---

## Execution Order Overview

1. Prep branch (done above)
13. Full verification pass

Commit after each numbered step so partial progress is preserved. Suggested commit prefixes: `chore(cut): step-<n> <short desc>`.

## STEP 15 — Verification

Run the verification pass and confirm each check succeeds. If any step fails, stop and diagnose — do not proceed until green.

```bash
pnpm install
docker compose up -d
pnpm migrate                          # must apply 028_drop_deprecated.sql cleanly
pnpm seed                             # must complete without error

pnpm typecheck                        # must be green
pnpm lint                             # must be green
pnpm test                             # remaining vitest suite must pass
pnpm build                            # standalone build must succeed
```

Manual smoke:

```bash
pnpm dev
```

Then in another shell, open a browser to `http://127.0.0.1:3000` and verify:

1. `/login` — form renders, seeded creds work.
2. Log in as `operator@pronto.sg` / `pronto-operator`:
   - `/operator` — client list renders
   - `/operator/conversations` — cross-client inbox renders
   - `/operator/escalations` — grouped list renders
   - `/operator/clients/[clientId]` — 4 tabs (Workspace, Conversations, Brand Voice, Agent Tuning) — no dead links
   - `/operator/clients/[clientId]/channels` — channel setup UI works (5 kinds: email, whatsapp, instagram, telegram, messenger)
   - `/operator/clients/[clientId]/conversations` — list + filter works
   - `/operator/clients/[clientId]/knowledge` — list + add form works
   - `/operator/clients/[clientId]/integrations` — 6 integrations available
   - `/operator/clients/[clientId]/flows` — JSON editor renders + saves
   - `/operator/clients/[clientId]/users` — user management works
   - `/operator/clients/[clientId]/offboarding` — export/delete UI works
   - No 404s from removed pages (alerts, quality, monthly-report, test, trace)
3. Log out, log in as `owner@northbridgenasi.sg` / `pronto-client`:
   - `/client` — dashboard renders
   - `/client/inbox` — conversation list renders
   - `/client/conversations/[id]` — transcript loads
   - `/client/escalations` — list works
   - `/client/knowledge` — list + add works (no URL/crawl fields visible)
   - `/client/settings` — form works
   - `/client/assistant` — change-request form works
4. `/csat/[some-conversation-id]` — survey renders (grab an id via `psql`).

E2E:

```bash
pnpm exec playwright install --with-deps chromium
pnpm test:e2e
```

Final grep sweeps — every command below should print NOTHING:

```bash
grep -rn "from \"@/lib/assistant" src/ 2>/dev/null
grep -rn "from \"@/lib/risk-monitor\"" src/ 2>/dev/null
grep -rn "from \"@/lib/reviews\"" src/ 2>/dev/null
grep -rn "from \"@/lib/monthly-report\"" src/ 2>/dev/null
grep -rn "@xyflow/react" src/ 2>/dev/null
grep -rn "circuit-breaker\|free-providers\|openai-compatible\|assistant-dock\|triage-flow-editor\|pilot-console\|provider-test-console" src/ 2>/dev/null
grep -rn "'console'" src/lib/channels/ 2>/dev/null
grep -rn "console_channel\|CONSOLE_CHANNEL" src/ 2>/dev/null
grep -rn "assistant_threads\|risk_monitor_\|client_launch_milestones\|client_commercial_assumptions\|rate_limit_buckets\|webhook_replay_events\|llm_provider_credentials\|reviews\." src/ scripts/ 2>/dev/null
grep -rn "PRONTO_GROQ\|PRONTO_OPENROUTER\|PRONTO_GITHUB_MODELS\|PRONTO_HUGGINGFACE\|PRONTO_CEREBRAS\|AZURE_OPENAI\|PRONTO_RISK_ALERT_WEBHOOK_URL\|PRONTO_RATE_LIMIT_BACKEND" src/ scripts/ 2>/dev/null
```

If any of the above returns hits, fix the reference and re-run.

Commit: `chore(cut): step-15 verification pass`

---

## Reference — All Files/Directories Deleted

```
src/lib/llm/azure.ts
src/lib/llm/free-providers.ts
src/lib/llm/circuit-breaker.ts
src/lib/llm/openai-compatible.ts
src/lib/assistant/                                     (entire directory)
src/lib/risk-monitor.ts
src/lib/reviews.ts
src/lib/monthly-report.ts
src/lib/channels/webhook-replay.ts
src/lib/channels/webhook-batch.ts
src/lib/knowledge/website.ts

src/app/api/assistant/                                 (entire directory)
src/app/api/console/                                   (entire directory)
src/app/api/operator/provider-test/                    (entire directory)
src/app/api/operator/reviews/                          (entire directory)
src/app/api/operator/monthly-report/                   (entire directory)
src/app/api/operator/client-commercials/               (entire directory)

src/app/operator/alerts/
src/app/operator/quality/
src/app/operator/clients/[clientId]/monthly-report/
src/app/operator/clients/[clientId]/test/
src/app/operator/clients/[clientId]/conversations/[conversationId]/trace/
src/app/client/test/
src/app/client/flows/

src/components/assistant-dock.tsx
src/components/assistant-dock-loader.tsx
src/components/assistant-dock-parts.tsx
src/components/pilot-console.tsx
src/components/provider-test-console.tsx
src/components/triage-flow-editor.tsx
src/components/triage-flow-editor-loader.tsx

scripts/assistant-eval.ts
scripts/monthly-report.ts
scripts/retention-prune.ts
scripts/risk-monitor-pricing.ts
scripts/risk-monitor-policy.ts

tests/unit/assistant-actions.test.ts
tests/unit/assistant-confirm-route.test.ts
tests/unit/assistant-context.test.ts
tests/unit/assistant-llm-schema.test.ts
tests/unit/cost-and-concentration-alerts.test.ts
tests/unit/http-limits.test.ts
tests/unit/llm-configuration.test.ts
tests/unit/monthly-report.test.ts
tests/unit/provider-portability.test.ts
tests/unit/reviews.test.ts
tests/unit/risk-monitor.test.ts
tests/unit/webhook-batch.test.ts
tests/unit/webhook-replay.test.ts
tests/unit/website-knowledge.test.ts

docs/compliance/data-retention.md
docs/business/pricing-assumptions.md
```

Note: The `src/app/operator/clients/[clientId]/flows/` directory is deleted then re-created with the new JSON editor page (Step 6a).

## Reference — All Files Edited

```
package.json
.env.example
src/lib/env.ts                                         (if exists)
src/lib/llm/catalog.ts
src/lib/llm/credentials.ts
src/lib/llm/index.ts
src/lib/llm/mock-status.ts
src/lib/agent/engine.ts
src/lib/agent/config.ts
src/lib/agent/trace.ts
src/lib/channels/catalog.ts
src/lib/channels/dispatch.ts
src/lib/channels/process.ts
src/lib/channels/types.ts                              (if console literal here)
src/lib/knowledge/ingest.ts
src/lib/knowledge/manage.ts
src/lib/http-limits.ts
src/lib/costing.ts
src/lib/dashboard.ts
src/lib/reporting.ts
src/lib/pilot-metrics.ts
src/lib/types.ts

src/app/operator/page.tsx
src/app/operator/clients/[clientId]/page.tsx
src/app/operator/clients/[clientId]/flows/page.tsx     (new)
src/app/client/page.tsx
src/app/client/knowledge/page.tsx
src/app/client/settings/page.tsx
src/app/client/escalations/page.tsx
src/app/client/assistant/page.tsx
src/app/client/inbox/page.tsx

src/components/agent-config-panels.tsx
src/components/integrations-panel.tsx
src/components/local-release-panels.tsx
src/components/shell.tsx
src/components/operator-sidebar-actions.tsx
src/components/bulk-escalation-list.tsx
src/components/triage-flow-json-editor.tsx             (new)

scripts/seed.ts
scripts/staging-preflight.ts

.github/workflows/ci.yml
docs/AGENT_CONTEXT.md
docs/HUMAN-SETUP.md
docs/setup/staging-env.md
docs/setup/onboarding.md
docs/architecture.md
docs/compliance/ai-policy.md
README.md

db/migrations/028_drop_deprecated.sql                  (new)
```

## Reference — What's Explicitly Kept (Rationale)

### Core product (PDF-mandated)
| Feature | Files | Why |
|---|---|---|
| RAG | `src/lib/knowledge/{chunk,ingest,manage,metadata,parse-upload,query,refresh,retrieve}.ts` | Core PDF claim |
| Agent engine | `src/lib/agent/{engine,config,guardrails,integration-tools,readiness,runtime-limits,self-check,trace}.ts` | Core |
| Escalation logic | `src/lib/escalations*.ts`, `src/lib/triage-flow*.ts` (server-side) | Smart Triaging (PDF) |
| Brand voice | `src/lib/brand-voice.ts` | Core PDF claim |
| 5 channels | `src/lib/channels/{email,whatsapp,instagram,telegram,messenger}.ts` + shared infra | Omnichannel (PDF) |
| 6 integrations | `src/lib/integrations/{shopify,woocommerce,google-calendar,calendly,delivery,inventory}.ts` | Live data (PDF) |
| CSAT | `src/lib/csat.ts`, `src/app/csat/[conversationId]/page.tsx`, `src/app/api/csat/route.ts` | Pilot metric |

### Foundational (kept regardless of stage)
| Feature | Files | Why |
|---|---|---|
| Auth + RBAC | `src/lib/auth.ts`, `src/lib/rbac.ts`, `src/app/api/auth/*` | Login, multi-tenant |
| Tenant isolation | `src/lib/tenant-context.ts`, `PRONTO_ENFORCE_TENANT_SQL` gate | Multi-client safety |
| Encrypted credentials | `src/lib/channels/credentials.ts`, `src/lib/integrations/credentials.ts`, `src/lib/secret-key.ts`, `scripts/encrypt-channel-credentials.ts` | Compliance |
| Outbox / worker | `src/lib/channels/outbox.ts`, `scripts/worker.ts`, `scripts/retry-outbox.ts` | Reliable delivery (WA/Meta resend behavior) |
| Audit logs | `src/lib/audit.ts`, `audit_logs` table | Compliance |
| Error tracking | `src/lib/error-tracking.ts`, `error_events` table | Operations |
| Basic logging | `src/lib/logger.ts` | Operations |
| Body-size limits | remaining part of `src/lib/http-limits.ts` | Security |
| Migrations 001–027 | `db/migrations/*.sql` (unchanged) | Historical integrity |
| Docker infra | `Dockerfile`, `docker-compose.yml` | Deployment |

### LLM providers kept
- `src/lib/llm/openai.ts` — primary
- `src/lib/llm/anthropic.ts` — manual fallback
- `src/lib/llm/mock.ts` — local dev
- `src/lib/llm/prompt.ts` — system prompts
- `src/lib/llm/types.ts` — shared types
- `src/lib/llm/errors.ts` — error types
- `src/lib/llm/catalog.ts` — simplified to those 3 providers
- `src/lib/llm/credentials.ts` — simplified for OpenAI/Anthropic
- `src/lib/llm/index.ts` — simplified exports

### Tests kept
All `tests/unit/*.test.ts` files not in the deleted list. Confirm with:
```bash
ls tests/unit/ | wc -l                                # should be ~68 files
```

### Docs kept
- `README.md`, `docs/AGENT_CONTEXT.md`, `docs/HUMAN-SETUP.md` — updated in Step 11
- `docs/architecture.md` — updated
- `docs/setup/{staging-env,onboarding,integration-playbook}.md` — updated
- `docs/channels/webhook-setup.md` — kept as-is
- `docs/costing/prompt-caching.md` — kept as-is
- `docs/compliance/{ai-policy,dpo-record,internal-data-protection-policy,openai-data-residency}.md` — kept (mostly)
- `docs/security/encryption-checklist.md` — kept
- `docs/legal/{client-contract-draft,dpa-draft}.md` — kept
- `docs/ops/{team-and-capacity,incident-response,postmortem-template}.md` — kept

---

## Post-Cut Expected Deltas

- Code: ~30–40% reduction (files + LOC)
- Client bundle: ~500KB smaller (xyflow removed)
- Env vars: 90 → ~55
- pnpm scripts: 20 → 15
- LLM provider files: 8 → 3
- Channels: 6 → 5
- API routes: ~40 → ~30
- DB tables: 38 → ~26 (12 dropped in migration 028)
- Test files: 82 → ~68 (14 removed)

## Follow-Ups NOT in Scope Here (Do Later)

- Simplify `agent_configs` schema by dropping unused columns (requires app-side + migration; leave for a later cleanup pass).
- Move remaining "operator monthly report" to a PDF-generation script (if the team decides that's the DFY deliverable). Currently OK to do manually.
- Consider dropping `metric_events` if not used post-cut (verify with grep first).
- Consider dropping `agent_config_changes` if agent config audit is redundant with `audit_logs`.

## Common Pitfalls

- Don't delete `client_assistant_change_requests` — that supports the client-side "request an assistant change" form and IS in the PDF spirit ("done-for-you" with client change requests).
- Don't delete `agent_traces` — useful debug data even without a UI.
- Don't delete `email_suppressions` — needed for Postmark/Resend bounce hygiene.
- Don't delete the `outbound_messages` outbox — required for WhatsApp reliability at scale.
- Don't delete `audit_logs` — compliance surface.
- If mid-step a typecheck fails on `import { X } from "@/lib/Y"` where Y is being deleted — finish the deletion, then remove that import.
- If Playwright smoke test hits a removed page — update the test file to point at a kept page (e.g. `/operator/conversations` instead of `/operator/alerts`).

## End
