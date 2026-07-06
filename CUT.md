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
7. Delete cut scripts + related package.json entries
8. Remove xyflow dep + remove cut env vars from `.env.example`
9. Add `db/migrations/028_drop_deprecated.sql`
10. Update `scripts/seed.ts` (no console channel, no cut tables)
11. Update `scripts/staging-preflight.ts` (drop cut env checks)
12. Update docs
13. Full verification pass

Commit after each numbered step so partial progress is preserved. Suggested commit prefixes: `chore(cut): step-<n> <short desc>`.

## STEP 7 — Delete Cut Scripts + Update package.json

Delete files:
```
scripts/assistant-eval.ts
scripts/monthly-report.ts
scripts/retention-prune.ts
scripts/risk-monitor-pricing.ts
scripts/risk-monitor-policy.ts
```

Edit `scripts/staging-preflight.ts`:
- Remove any preflight assertions for cut env vars (AZURE_*, PRONTO_GROQ_API_KEY, etc.).
- Remove any table-existence checks for dropped tables (`risk_monitor_*`, `reviews`, `assistant_*`, `rate_limit_buckets`, `webhook_replay_events`, `llm_provider_credentials`, `client_launch_milestones`, `client_commercial_assumptions`).

Edit `package.json`:

Remove scripts:
- `assistant:eval`
- `risk:monitor:pricing`
- `risk:monitor:policy`
- `monthly:report`
- `retention:prune`

Remove dependency:
- `@xyflow/react`

Diff (target `package.json`):
```json
{
  "scripts": {
    "dev": "next dev --hostname 127.0.0.1 --port 3000",
    "build": "next build",
    "start": "next start --hostname 127.0.0.1 --port 3000",
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "migrate": "tsx scripts/migrate.ts",
    "seed": "tsx scripts/seed.ts",
    "eval": "tsx scripts/eval.ts",
    "staging:preflight": "tsx scripts/staging-preflight.ts",
    "preflight:ci": "PRONTO_PREFLIGHT_PROFILE=ci tsx scripts/staging-preflight.ts",
    "channels:encrypt-credentials": "tsx scripts/encrypt-channel-credentials.ts",
    "worker": "tsx scripts/worker.ts",
    "outbox:retry": "tsx scripts/retry-outbox.ts"
  },
  "dependencies": {
    "lucide-react": "^1.16.0",
    "mammoth": "^1.12.0",
    "next": "16.2.9",
    "openai": "^6.38.0",
    "pdf-parse": "^2.4.5",
    "pg": "^8.20.0",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "server-only": "^0.0.1",
    "tsx": "^4.22.4",
    "zod": "^4.4.3"
  }
}
```

(Leave `devDependencies` untouched.)

Then run:
```bash
pnpm install
```

Commit: `chore(cut): step-7 remove deprecated scripts + xyflow dep`

---

## STEP 8 — Clean .env.example

Edit `.env.example`. The final file should be exactly:

```
DATABASE_URL=postgres://pronto:pronto@localhost:55432/pronto
AUTH_SECRET=replace-with-a-long-random-secret
APP_BASE_URL=http://localhost:3000
PRONTO_ENFORCE_TENANT_SQL=0
PRONTO_DISABLE_TENANT_SQL_GATE=0
PRONTO_LOCALE=en-SG
PRONTO_TIME_ZONE=UTC

# LLM providers. OpenAI is primary; Anthropic is optional manual fallback.
PRONTO_USE_MOCK_AI=1
PRONTO_LLM_PROVIDER=openai
PRONTO_SECRETS_KEY=replace-with-a-long-local-secret-for-encrypted-provider-keys

OPENAI_API_KEY=
OPENAI_BASE_URL=
OPENAI_RESPONSE_MODEL=gpt-5.5
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# Optional Anthropic fallback (manual, not automatic failover).
ANTHROPIC_API_KEY=
ANTHROPIC_BASE_URL=
ANTHROPIC_RESPONSE_MODEL=claude-sonnet-4-5

# Meta WhatsApp Cloud API.
WHATSAPP_GRAPH_VERSION=v20.0
WHATSAPP_APP_SECRET=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_VERIFY_TOKEN=local-pronto-verify-token

# Telegram Bot API.
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=local-pronto-telegram-secret

# Meta Messenger / Instagram.
META_GRAPH_VERSION=v20.0
MESSENGER_PAGE_ACCESS_TOKEN=
MESSENGER_APP_SECRET=
MESSENGER_VERIFY_TOKEN=
INSTAGRAM_PAGE_ACCESS_TOKEN=
INSTAGRAM_APP_SECRET=
INSTAGRAM_VERIFY_TOKEN=

# Email channels.
POSTMARK_API_TOKEN=
POSTMARK_FROM_ADDRESS=
POSTMARK_WEBHOOK_SECRET=
RESEND_API_KEY=
RESEND_FROM_ADDRESS=
RESEND_WEBHOOK_SECRET=

# Optional error webhook (Slack/Discord/etc.).
PRONTO_ERROR_ALERT_WEBHOOK_URL=

# Optional local/runtime controls.
PRONTO_SKIP_LIVE_HEALTH=0
PRONTO_DISABLE_CSAT_HOOK=0
PRONTO_OUTBOX_RETRY_LIMIT=25
PRONTO_OUTBOX_STALE_SENDING_MINUTES=10
PRONTO_OUTBOX_MAX_ATTEMPTS=5

# Optional eval script controls.
EVAL_FILE=evals/pronto-fnb-golden.json
EVAL_CLIENT_SLUG=north-bridge-nasi
```

Removed (relative to previous):
- `PRONTO_ASSISTANT_LLM_PROVIDER`, `PRONTO_ASSISTANT_MODEL`
- `PRONTO_ENABLE_PROVIDER_FAILOVER`
- All `AZURE_OPENAI_*`
- `PRONTO_GROQ_API_KEY`, `PRONTO_OPENROUTER_API_KEY`, `PRONTO_GITHUB_MODELS_API_KEY`, `PRONTO_HUGGINGFACE_API_KEY`, `PRONTO_CEREBRAS_API_KEY`
- `PRONTO_RISK_ALERT_WEBHOOK_URL`
- `PRONTO_RATE_LIMIT_BACKEND`
- `ASSISTANT_EVAL_FILE`, `ASSISTANT_EVAL_CLIENT_SLUG`, `ASSISTANT_EVAL_LIVE`

Search the codebase and remove references to the removed env vars:

```bash
grep -rn "AZURE_OPENAI\|PRONTO_GROQ\|PRONTO_OPENROUTER\|PRONTO_GITHUB_MODELS\|PRONTO_HUGGINGFACE\|PRONTO_CEREBRAS\|PRONTO_RISK_ALERT_WEBHOOK_URL\|PRONTO_RATE_LIMIT_BACKEND\|PRONTO_ASSISTANT_LLM_PROVIDER\|PRONTO_ASSISTANT_MODEL\|PRONTO_ENABLE_PROVIDER_FAILOVER\|ASSISTANT_EVAL_" src/ scripts/ 2>/dev/null
```

For each hit outside `.env.example` and this `CUT.md`, delete the reference in code.

Also edit `src/lib/env.ts` (if it declares typed env schemas) to remove entries for the cut vars.

Commit: `chore(cut): step-8 prune env vars`

---

## STEP 9 — Add Consolidation Migration `028_drop_deprecated.sql`

Create file `db/migrations/028_drop_deprecated.sql` with the exact SQL below:

```sql
-- Migration 028: Drop deprecated tables after scope cut.
-- Safe drops for tables no longer referenced by application code.

BEGIN;

-- Assistant/copilot (migration 014)
DROP TABLE IF EXISTS assistant_action_proposals CASCADE;
DROP TABLE IF EXISTS assistant_messages CASCADE;
DROP TABLE IF EXISTS assistant_threads CASCADE;

-- Reviews / QA labels (migration 003)
DROP TABLE IF EXISTS reviews CASCADE;

-- Risk monitoring (migration 017)
DROP TABLE IF EXISTS risk_monitor_findings CASCADE;
DROP TABLE IF EXISTS risk_monitor_snapshots CASCADE;
DROP TABLE IF EXISTS risk_monitor_sources CASCADE;

-- Client launch milestones + commercial assumptions (from migration 009 readiness bundle)
DROP TABLE IF EXISTS client_launch_milestones CASCADE;
DROP TABLE IF EXISTS client_commercial_assumptions CASCADE;

-- LLM provider credentials (migration 011)
DROP TABLE IF EXISTS llm_provider_credentials CASCADE;

-- Rate limit buckets (migration 016)
DROP TABLE IF EXISTS rate_limit_buckets CASCADE;

-- Webhook replay events (from migration 007 or 024, verify column existence first)
DROP TABLE IF EXISTS webhook_replay_events CASCADE;

-- Email suppressions - KEEP: still needed for bounce handling (Postmark/Resend)
-- (this line intentionally left as a comment for reviewer clarity)

-- Note: Do NOT drop:
--   clients, users, channels, conversations, messages, escalations,
--   knowledge_sources, knowledge_chunks, knowledge_source_versions,
--   knowledge_refresh_requests, agent_configs, agent_config_changes,
--   agent_traces, brand_voice_documents, brand_voice_examples,
--   csat_responses, integration_credentials, outbound_messages,
--   error_events, audit_logs, metric_events, email_suppressions,
--   client_assistant_change_requests, triage_flows

COMMIT;
```

Verification query (run after migrate):

```sql
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
```

None of the dropped tables should appear.

If seeded data referenced any dropped table, the `pnpm seed` script must be updated in Step 10.

Commit: `chore(cut): step-9 add migration 028 drop deprecated tables`

---

## STEP 10 — Update `scripts/seed.ts`

Edit `scripts/seed.ts`:

Remove all seeding logic for:
- `assistant_threads`, `assistant_messages`, `assistant_action_proposals`
- `reviews`
- `risk_monitor_sources`, `risk_monitor_snapshots`, `risk_monitor_findings`
- `client_launch_milestones`, `client_commercial_assumptions`
- `llm_provider_credentials`
- `rate_limit_buckets`
- `webhook_replay_events`

Also remove:
- Any creation of a `console` channel row.

Keep seeded:
- Operator + client user
- Pilot F&B client (North Bridge Nasi)
- 5 seeded channels (Email, WhatsApp, Instagram, Telegram, Messenger)
- Knowledge sources + chunks
- Sample brand voice document + examples
- Sample triage flow (unchanged structure — JSON in `triage_flows` table)
- Agent config

Commit: `chore(cut): step-10 update seed`

---

## STEP 11 — Update Docs

### 11a. Delete files

```
docs/compliance/data-retention.md
docs/business/pricing-assumptions.md
```

(Pricing in the PDF supersedes the older draft.)

### 11b. Edit `README.md`

Replace the "Useful Commands" and "Environment Notes" sections. New content:

```
## Useful Commands

pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm outbox:retry

Use pnpm outbox:retry after testing failed WhatsApp/Telegram/Instagram/Email owner replies or stale `sending` rows.

## Environment Notes

The app defaults to mock AI with PRONTO_USE_MOCK_AI=1, so local testing works without paid model keys. To test live providers, set PRONTO_USE_MOCK_AI=0 and configure OPENAI_API_KEY (or ANTHROPIC_API_KEY as a manual fallback).

Live WhatsApp, Instagram, Messenger, Telegram, and Email testing requires real channel credentials plus a public HTTPS tunnel set as APP_BASE_URL. See docs/channels/webhook-setup.md and docs/setup/staging-env.md.

## Local Release Checks

pnpm typecheck
pnpm lint
pnpm test
pnpm build

If a migration was added, run pnpm migrate before starting the app again.
```

### 11c. Edit `docs/AGENT_CONTEXT.md`

- Remove references to: assistant subsystem, risk monitoring, monthly reports, retention pruning, rate limiting, webhook replay, provider failover, Azure OpenAI, free providers, xyflow triage editor, console channel.
- Update the migration list (add 028_drop_deprecated).
- Update the "Where to start" section to reflect the reduced surface.

### 11d. Edit `docs/HUMAN-SETUP.md`

- Remove sections on Azure OpenAI and free providers.
- Remove Console channel testing instructions.
- Remove any risk-monitor cron scheduling notes.

### 11e. Edit `docs/setup/staging-env.md`

- Sync the required env vars section to match the new `.env.example`.
- Remove per-provider staging requirements for cut LLM providers.
- Remove risk-monitor / retention-prune scheduled-job notes.

### 11f. Edit `docs/architecture.md`

- Remove the "Provider portability with failover" paragraph, if present.
- Remove any assistant / copilot architecture diagram or paragraph.
- Remove risk monitoring section.

### 11g. Edit `docs/setup/onboarding.md`

- Remove references to cut modules.
- Update the "Module Map" table to match the pared-down set.
- Update the 2-week onboarding targets to remove references to assistant eval or risk monitor tasks.

### 11h. Edit `docs/compliance/ai-policy.md`

- Remove the paragraph about `risk:monitor:policy` cron and `risk_monitor_findings`.
- Keep the AI disclosure + WhatsApp policy content.

Commit: `chore(cut): step-11 update docs`

---

## STEP 12 — Simplify `src/lib/dashboard.ts` and `src/lib/reporting.ts`

These files aggregate metrics for the operator and client dashboards. After the cuts they will reference dropped tables/features.

Grep for references to dropped tables and features and remove them:

```bash
grep -n "reviews\|risk_monitor\|assistant_threads\|assistant_messages\|assistant_action_proposals\|client_launch_milestones\|client_commercial_assumptions\|rate_limit_buckets\|webhook_replay_events\|llm_provider_credentials\|answer_label\|hallucination\|quality_blocker" src/lib/dashboard.ts src/lib/reporting.ts src/lib/pilot-metrics.ts
```

For each hit:
- If it's a SELECT/JOIN against a dropped table → remove the column, join, and any UI consumer.
- If it's a synthetic metric relying on removed data → drop the metric.

Downstream: pages that display those metrics (e.g. `src/app/operator/page.tsx`, `src/app/client/page.tsx`, `src/app/operator/clients/[clientId]/page.tsx`) must have the corresponding stat cards removed.

Grep the client and operator page.tsx files:

```bash
grep -n "hallucination\|quality\|failed_sends\|sla_breach\|reviews" src/app/operator/**/*.tsx src/app/client/**/*.tsx
```

For each hit, remove the stat card / list / filter.

Commit: `chore(cut): step-12 remove references to dropped metrics`

---

## STEP 13 — Update `docker-compose.yml` and `Dockerfile`

No changes required. Keep both files as-is. The worker still runs `pnpm worker` (outbox), and the runner still serves Next.js standalone.

---

## STEP 14 — CI Workflow Update

Edit `.github/workflows/ci.yml`:

- If the workflow references `pnpm assistant:eval`, `pnpm monthly:report`, `pnpm risk:monitor:pricing`, `pnpm risk:monitor:policy`, or `pnpm retention:prune` — remove those steps.
- The workflow should still run: preflight:ci, typecheck, lint, test:coverage, build, playwright, docker builds.

Commit: `chore(cut): step-14 update CI workflow`

---

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
