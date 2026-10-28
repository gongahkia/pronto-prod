# Free hosting preparation verification

26–27 October 2026. Source preparation only: this agent did not provision cloud resources, commit, push or deploy. Gabriel's screenshots confirm signed-in Render/Neon accounts; Render already contains a separate `tanabata` project, which was not accessed or changed. Account billing, remaining shared quotas and actual cloud acceptance still require review.

## Completed engineering

- Next.js / eslint-config-next 16.4.1; DOMPurify 3.4.17; Zod 4.6.6; Nodemailer 10.1.4. Narrow overrides replace older affected transitive Zod/Nodemailer copies. The production audit reports zero findings under the existing repository policy; no new suppression was added.
- Protected-demo request processing is enabled only with `PRONTO_DEMO_PROCESSING_MODE=request`. Existing local/tunnel environments retain their worker mode. Same-origin authenticated `POST /api/demo/process` takes no job/tenant/channel parameters, verifies the protected database/demo actor and handles a bounded slice of the existing queue.
- Inbound claims retain sequencing, attempts, leases, saved-answer reuse and human ownership. Recovery only resets expired `sending` rows for the exact synthetic console channel. Other provider transports retain their uncertainty/reconciliation policy. Dead inbound/delivery jobs remain visible and can use the existing bounded manual retry flow.
- Visible customer/business pages drive processing; a pending slice coalesces further wake-ups. No server interval, unauthenticated cron endpoint or paid worker is introduced. Idle-client pool errors are handled. Request-mode readiness reports that mode rather than requiring a fabricated continuous-worker heartbeat.
- Customer status polling no longer overlaps: slow responses can finish and appear in the UI. This was found while exercising the CPU limit.
- Feedback exports as `pronto.prototype-feedback.v1`, preserving page anchors, author identity, comments/replies, status and timestamps. Pagination/truncation are explicit. See [the schema and ingestion guide](../ops/prototype-feedback.md).
- Automatic route refresh pauses while feedback or a native modal is open, preserving review interactions.

## Verification

All destructive fixtures ran against a **new isolated PostgreSQL instance on port 55509**, never the existing persistent demo database. Dependencies were installed in a separate source copy; the running local and protected-tunnel installations kept their original dependency environment.

| Check | Result |
|---|---|
| Safe complete regression run on Node 24 | 607 passed, 109 database-dependent tests skipped |
| Isolated PostgreSQL queue / simulator / inbox tests | 23 passed, including five new request-processing recovery cases |
| Latest focused polling, endpoint, processor and export tests | 20 passed, including the subsequently added slow-poll regression |
| Final feedback refresh, export and request-body regression checks | 7 passed |
| TypeScript / ESLint | Passed |
| Patched production build on Node 24, one worker | Exit 0; 75.88 seconds on the busy local host; peak build RSS 1,085,920 KiB, approximately 1,061 MiB |
| Runtime limits | A dedicated systemd cgroup enforced **512 MiB MemoryMax** and **0.1 CPU** (`CPUQuotaPerSecUSec=100ms`) on the standalone server and its small launcher |
| Observed constrained runtime peak | **198,410,240 bytes, approximately 189 MiB**, during the authenticated small-demo workflow |

The constrained runtime used a separate protected database with verified local TLS, a restricted runtime SQL role, private random synthetic accounts/secrets and the existing approved Groq key loaded only into runtime memory. There was no persistent worker. A real GPT-OSS 20B answer was generated, persisted and delivered. The database recorded one reply-generation call and one automatic Insights synthesis call, each attributed to Groq.

After restarting only this QA server and simulating expired processing/sending leases, opening customer chat recovered the saved reply without another reply-generation call or duplicate visible message. The same answer appeared in the business thread. Request-mode readiness passed, automatic Insights completed, and the workspace feedback export preserved its QA thread context. Anonymous export returned 401; the workflow browser run reported no page errors or mobile horizontal overflow. A final desktop/mobile browser check loaded the saved feedback and downloaded `pronto-feedback.json` successfully.

This is evidence for a small interactive POC under equivalent local resource controls, **not** proof of Render/Neon uptime, cold-start behavior, account quota availability or peak memory for large document imports. Actual provider acceptance must repeat the sleep/restart workflow. Processing is guaranteed to resume only when an authenticated demo page is active; unattended operations are outside this profile.

## UI review

Playwright Chromium was used because Browser/IAB was unavailable. The existing feedback panel and Gabriel's reference screenshots were inspected with `view_image` alongside the latest renders at 1440 × 1000 and 390 × 844. Checked: existing white/indigo palette, typography hierarchy, panel spacing, download/close icons, export copy, footer action placement and mobile overflow. The added export follows the existing button system. No theme or unrelated navigation change was introduced. Temporary QA screenshots are removed after review.

## Remaining deployment steps

Use the [Free-only Blueprint example](../../deploy/render-free.blueprint.yaml.example) and [web-only Dockerfile](../../deploy/render-web.Dockerfile). Apply migrations through **055** with a direct Neon owner connection, then bootstrap fresh private synthetic accounts; use the pooled restricted role URL at runtime. Keep Groq as the only model provider, mock output off, live Chope off, booking writes off and external channel/SMTP credentials absent.

Before any cloud write, obtain the explicit approval requested by Gabriel for provisioning/deployment and any commit/push. Verify Render's existing workspace has sufficient shared free hours/bandwidth/build minutes and enforceable S$0 exhaustion behavior; the separate `tanabata` service may consume those shared allowances. Do not modify it or upgrade a plan. Complete the [cloud acceptance plan](render-neon-free-assessment.md), including an external-device test with Gabriel's laptop off.

The subsequent [POC deployment fixes](deployment-fixes.md) add clean-checkout image verification, Groq-only knowledge publication and model/knowledge readiness checks. The verification table above describes the earlier preparation run.
