# Independent S$0 Pronto AI demonstration

Assessed 26 October 2026, with local engineering preparation completed later the same day. This replaces the laptop tunnel as the **target** architecture. No cloud account was provisioned or deployment performed by this agent; no commit or push was initiated by this agent. The existing local demo and running Cloudflare tunnel were preserved.

**Preparation update:** Next.js / eslint-config-next 16.4.1, DOMPurify 3.4.17, Zod 4.6.6 and Nodemailer 10.1.4 are now pinned/overridden in the source and lockfile, including vulnerable older transitive copies. The patched production audit reports zero findings under the existing audit policy. The dependency set was installed and tested in an isolated copy; the running local/tunnel installations were not replaced. The request-driven adapter below is implemented as `PRONTO_DEMO_PROCESSING_MODE=request`, using same-origin authenticated `POST /api/demo/process`. No persistent worker is needed in that mode. Earlier baseline measurements and the original design discussion below are retained for context; statements describing these patches/adapter as pending are superseded by this update. Provider-specific Render/Neon acceptance and explicit deployment approval remain required.

## Verdict

Current source/test/resource evidence is recorded in [the completed preparation verification](free-hosting-preparation.md). The first baseline below predates those patches; use the newer report for current engineering status.

**Render Free + Neon Free + Groq Free is a plausible fit for Keith's small interactive POC. The queue adapter and dependency patches are implemented; cloud acceptance and explicit deployment approval remain outstanding.** Use one Render web service for the existing Next.js frontend and APIs, one Neon project for persistent PostgreSQL, and the existing approved Groq GPT-OSS 20B inference. No second API service, Redis, paid worker or Render database is necessary.

After that arrangement is deployed and verified, Keith can access it with Gabriel's computer off. **Today's active tunnel still depends on the laptop.** No independently hosted endpoint has been created by this assessment.

Render's free service types exclude background workers. The app now supports protected-demo request processing as an alternative to the existing worker: visible authenticated demo pages call a bounded processor, while jobs and leases remain in PostgreSQL. The local and tunnel deployments retain their worker mode. [Render free service types](https://render.com/docs/free)

## Repository and deployment inspection

- The app uses Next.js 16.4 / React 19, Node 24 locally, `output: "standalone"`, PostgreSQL inbox/outbox jobs and pgvector. Authentication, tenant SQL checks, capability grants, exact-revision knowledge approval and human takeover already exist.
- The protected hosted-demo profile already checks HTTPS, strong independent secrets, a unique database identity, invited synthetic account IDs and synthetic-only console delivery. It refuses the disposable-test database identity.
- The current local web/worker/database and the separate protected tunnel deployment were inspected read-only. The tunnel runs an older isolated standalone build; changing repository files does not redeploy it.
- Git already contained work in progress and changed during the session. No existing user changes were reset. Render/Neon account inventory, billing settings and available quotas could not be inspected: no authenticated connector or API credentials for those services were available.
- `deploy/render-web.Dockerfile` and `deploy/render-free.blueprint.yaml.example` are review artifacts. The latter selects `plan: free`, request processing and automatic deployment off. No resource has been created from them.

## Measured memory and runtime

The following table records the initial baseline, built separately from both running deployments without dotenv files or Git. The subsequent authenticated, resource-constrained verification is recorded in [free hosting preparation](free-hosting-preparation.md).

| Check | Observed result | What this establishes |
|---|---|---|
| Production webpack build, Node heap 1,536 MiB, one build worker, memory optimization enabled | Exit 0; 13.98 seconds; maximum RSS **900,496 KiB ≈ 879 MiB** | A production build succeeds after moving an unsupported route-module helper export into a library. This is build memory, not web-server memory. |
| Initial rebuild with the web-only Dockerfile's explicit source inputs | Exit 0; 21.96 seconds; maximum RSS **947,940 KiB ≈ 926 MiB** | The source compiled without dotenv files, migration scripts or tests in the image input. Dependencies were subsequently patched and verified separately. |
| Final standalone server, Node heap limited to 256 MiB | Startup **621 ms**; 30 login/health requests at concurrency 2; all HTTP 200; slowest 74 ms; maximum observed RSS/HWM **145,480 KiB ≈ 142 MiB** | The anonymous web baseline fits comfortably below 512 MiB on this host. No database or AI calls were included. |
| Existing protected production server, inspected without restart | Process high-water RSS **173,880 KiB ≈ 170 MiB**; health HTTP 200 | Additional evidence from the older running demo, not a load test of the new revision. |

Render Free provides **0.1 CPU / 512 MB RAM**. A subsequent systemd cgroup enforced these limits locally: authenticated customer messaging, a real Groq answer, saved-answer recovery, business Inbox, automatic Insights and feedback export completed with a runtime peak of approximately **189 MiB**. Docker itself was unavailable through this WSL integration. Large document parsing and actual provider sleep/restart behavior remain cloud acceptance checks. [Render compute specifications](https://render.com/docs/compute-plans)

Render builds run on separate compute. Its default Starter pipeline has 2 CPUs / 8 GB RAM and Hobby includes 500 pipeline minutes monthly. The measured build therefore exceeding 512 MiB is not itself a runtime blocker. Use the ordinary included pipeline, not a paid performance build tier. [Render build pipeline](https://render.com/docs/build-pipeline)

Use production standalone Node, a 256-MiB JS heap, two database connections and serialized model processing initially. The proposed Dockerfile excludes Chromium and the worker image. Do not use the repository Dockerfile's final `worker-chope` stage by accident. Large PDF/DOCX parsing and concurrent Insights generation remain specific peak-memory tests; if necessary, bound import size/concurrency or keep large imports outside this narrow POC rather than silently upgrading compute.

### Dependency patch verification

The initial assessment identified Next.js 16.4.0 as a deployment blocker. The repository now pins **Next.js / eslint-config-next 16.4.1**, the patched release in the October advisory. The isolated Node 24 production build and regression checks passed with these versions. Existing running deployments were not replaced. [Official Next.js security update](https://nextjs.org/blog/nextjs-security-update-october-14-2026)

DOMPurify 3.4.17, Zod 4.6.6 and Nodemailer 10.1.4 are also pinned/overridden, including older transitive copies. The production audit reports zero findings under the repository's existing audit policy; no new suppression was added. This is a dated dependency check, so repeat it before deployment if the lockfile or advisories change.

## Request-driven queue adapter

The implemented **protected-demo-only request-driven processor** uses same-origin authenticated `POST /api/demo/process`. A slice handles at most one inbound job and up to three synthetic outbound rows before/after processing. One in-process promise prevents overlapping slices; PostgreSQL claims/leases remain authoritative across restarts and overlapping instances. No server interval is installed. An enqueue during an active slice schedules the next browser request immediately after completion. Ordinary local/production worker modes remain unchanged.

| Existing mechanism | Required adaptation / acceptance |
|---|---|
| `inbound_jobs`, atomic `FOR UPDATE SKIP LOCKED`, per-conversation sequencing, five attempts and a 120-second default lease | Select only the fixed demo tenant and console channel. Reuse the existing claim/processing engine. Reclaim expired leases on the next visit, and mark exhausted work dead visibly. Never delete pending jobs to recover. |
| Agent message and escalation persistence before retry; scoped outbound idempotency | Reuse persisted results before another model call. Verify that retrying a customer request does not create a second visible answer or handoff. |
| Durable outbound state, claim-before-send, stale sends become `uncertain` | Add recovery only for the exact synthetic console transport, whose delivery has no external network side effect. After a verified expired lease, retry its state transition idempotently. Preserve the existing uncertainty/reconciliation rules for every real provider. |
| Retry endpoint currently resets dead inbound jobs | Extend it narrowly to exhausted synthetic console outbox work too. Retain actor/session ownership and bounded retry limits. Show failed/dead delivery in the customer UI instead of leaving an endless spinner. |
| Readiness and worker monitoring | Report request-driven mode, backlog and last pump outcome honestly; do not invent a persistent worker heartbeat. Keep `/api/health` as a lightweight liveness probe without database polling. |

The trigger must validate authentication, same origin, protected-demo configuration, exact database marker, tenant/channel identity and account allowlist before draining anything. A browser must not choose another tenant or an arbitrary job. Do not expose an unauthenticated cron/pump endpoint. A mutation endpoint can be invoked by customer polling while work is pending; a normal read should not become a general-purpose job executor.

Await a bounded processing slice in a request or use a host-supported post-response callback only as an optimization. **Never rely on an unawaited promise or an interval for correctness.** Persist before acknowledging enqueue; on shutdown, leases and idempotency permit recovery on the next authenticated visit. No constant database poller or external keepalive is needed.

This provides durable, at-least-once execution. A crash after Groq returns but before the result is persisted can repeat a model invocation; exactly-once inference/billing cannot honestly be promised without provider support. The visible reply must still be deduplicated. A process stop during a synthetic send must not strand a row permanently in `sending`.

The trade-off is explicit: when nobody visits, no new work is guaranteed to execute. Scheduled reminders, unattended scraping and continuous integrations are outside this console-only POC. A restart can defer recovery until the inbound lease expires. This is suitable for Keith's customer-tab → business-tab workflow, not a claim of always-on customer operations. Isolated PostgreSQL tests now cover live/expired/exhausted leases, concurrent requests, saved-answer reuse, synthetic-send recovery, manual retry, takeover suppression and preservation of other transports. `demo_processing_status` records recent outcomes; readiness distinguishes request mode from a continuous worker. Slow browser polls are serialized so completed responses can be displayed.

## Cold starts and free quotas

Render sleeps after 15 idle minutes; its documented wake-up is roughly a minute. Free instances have ephemeral filesystems and share 750 instance hours per workspace per calendar month. Store all conversations, feedback, Insights snapshots and usage in Neon, not local files. The first customer visit may wait for Render and then Neon before Groq runs; preserve the submitted request ID, show processing state and keep polling recoverable. Opening both tabs beforehand is optional convenience, not an uptime mechanism. [Render free limits](https://render.com/docs/free)

Neon's current Free allowance is **1 GB PostgreSQL storage per project**, 100 CU-hours/project/month and 5 GB public transfer/project/month; compute can scale to 2 CU and always sleeps after five idle minutes. It includes 100 projects, ten branches per project, six-hour restore history capped at 1 GB, and one manual snapshot. Compute/egress exhaustion suspends the project; storage exhaustion blocks growth. Data is retained, and Free does not bill overages. These are the updated limits, not the older 0.5-GB/50-CU-hour figures. [Neon plan limits](https://neon.com/docs/introduction/plans), [Neon Free quota behavior](https://github.com/neondatabase/website/blob/main/content/faqs/free-plan-limits-and-quotas.md)

An idle worker that queries every few seconds would prevent Neon scale-to-zero and waste its allowance. The request-driven design avoids that. App tabs still poll while open, so close unused tabs and measure actual CU-hours; free quotas are shared with other use of the same workspace/project/account.

Groq currently lists GPT-OSS 20B Free base limits of **30 requests/minute, 1,000/day, 8,000 tokens/minute and 200,000/day**, with organization-specific exceptions. Verify the existing account's Free status and actual console limits. Planning/intake and Insights consume calls too, not just delivered customer replies. Keep cached Insights, bounded prompts and explicit 429/retry handling; never substitute a deterministic response or paid provider on failure. [Groq rate limits](https://console.groq.com/docs/rate-limits)

## Neon compatibility, security and migration

Neon supports PostgreSQL 18, matching the local major version. Its extension list includes pgvector (`vector`, currently 0.8.6 on PG18) and pgcrypto. The existing migrations use supported PostgreSQL features; run the complete migration chain and vector query smoke checks on the actual new database before declaring compatibility. [Neon version support](https://neon.com/docs/postgresql/postgres-version-support), [Neon extension matrix](https://neon.com/docs/extensions/pg-extensions)

Use the pooled `-pooler` hostname for runtime with `PRONTO_DB_POOL_MAX=2`. Neon uses PgBouncer transaction pooling: ordinary transactions, transaction advisory locks and queue row locks fit; session advisory locks do not. **Use the direct, nonpooled owner URL for the current migrator**, which takes `pg_advisory_lock` on a dedicated connection. Do not replace the current `pg` driver or introduce an HTTP driver without transaction/lease tests. [Neon pooling restrictions](https://neon.com/docs/connect/connection-pooling)

The pool now handles idle-client errors without an unhandled process error. Actual Neon pool reconnects after compute suspension still require cloud acceptance. Keep transaction/idempotency boundaries for writes rather than replaying arbitrary mutations; authenticated browser activity retries a failed processing request.

Require verified TLS. The protected profile already removes URL SSL overrides and uses `rejectUnauthorized: true`; never turn it off to connect. Neon requires TLS and supports hostname/certificate verification. Free does not include paid IP allowlisting or private networking, so assume a public TLS endpoint with strong unique credentials. Separate a migration owner from a restricted runtime role, granting only the table/sequence privileges the app actually needs. Validate database-comment marker visibility with that role. [Neon security controls](https://neon.com/docs/security/security-overview)

Create a new isolated database, set its unique protected-demo database comment and apply migrations 001–053 through the direct URL. Use the existing guarded `demo:protected bootstrap` with an owned mode-600 private JSON containing only invited `.test`/`.invalid` accounts and new strong passwords. Never run ordinary `pnpm seed`, test resets or disposable-test markers there. Do not upload the local database wholesale. Bootstrap curated public demo knowledge; create any new synthetic customer examples through the genuine Groq pipeline. Groq uses approved PostgreSQL text retrieval, so no paid embedding service is needed. New bootstrap fixtures use explicitly marked text-only chunks; existing stored vectors remain unchanged. See [the deployment fixes](deployment-fixes.md) for publication and preflight behavior.

Keep auth sessions, login throttling, tenant checks, role grants, knowledge publication and takeover/release controls. Keith gets business responder permissions, not operator or publication authority. Set `PRONTO_DEMO_ONLY_DELIVERY=1`, both Chope flags to `0`, mock AI to `0`, and configure only Groq. Do not supply SMTP, Meta, booking-write or other provider credentials. Cloud secrets go into server-only Render configuration; migration/bootstrap secrets stay in private administrative input. No `NEXT_PUBLIC_*` secrets, build arguments containing keys or plaintext credentials in Git.

The proposed container has no migration toolchain. Run migration/bootstrap once from an authorized administrative environment using the direct URL, with output redacted, before starting the service. Thereafter the laptop is not a runtime dependency. Preserve private backups outside the ephemeral web filesystem; Neon's short free recovery window is not a full backup policy.

## S$0 decision and deployment acceptance

| Component | Permitted choice | Cost control |
|---|---|---|
| Frontend + API | One Render **Free** web service on Hobby | No paid instance, worker, disk or cron. Check remaining shared hours/bandwidth/build minutes. |
| Persistent database | One Neon **Free** project | No Launch/Scale upgrade or paid add-ons; allow quota exhaustion to stop the demo. |
| Inference | Existing Groq **Free** account / GPT-OSS 20B | Verify account plan; no paid fallback or automatic upgrade. |
| URL / TLS | Included Render service hostname and HTTPS | No purchased domain or certificate. |

This is a POC/preview use matching Render's documented free purpose and Neon's prototype/small-team positioning; no Vercel Hobby eligibility assumption is involved. Account-specific eligibility remains to be checked. Render can bill supplementary bandwidth/pipeline usage when a payment method permits it; without one it suspends service/builds at the limit. **Do not activate until the account configuration establishes S$0 on exhaustion**, using no payment method where allowed or verified enforceable zero-spend controls. A build spend limit alone does not establish a bandwidth spending cap. [Render quota and billing behavior](https://render.com/docs/free), [Render pipeline spending controls](https://render.com/docs/build-pipeline)

1. Review the completed dependency patches and request-driven adapter, then repeat acceptance on the actual Render/Neon services. The isolated tests do not establish provider-specific wake-up behavior or account quota availability.
2. Present that implementation, exact Free selections, region and secret **names** for final deployment approval. No commit, push, account creation or deployment is authorized by this report.
3. After explicit approval, inspect existing Render/Neon accounts and resources first. Create only the agreed Free resources, preferably nearby regions where those Free plans are offered. Check quota/spend settings before creation; stop if the UI selects a paid default.
4. Migrate and bootstrap the new Neon database using private owner credentials; verify `vector`, TLS, the marker and the restricted runtime role. Configure fresh auth/encryption secrets, allowlisted synthetic users and the already-approved Groq key privately. Keep the existing local/tunnel setup intact.
5. Deploy a reviewed, pinned revision manually using the web-only image. Check assets, health, authenticated readiness and unauthenticated/cross-tenant denial. Verify no external channel, Chope, SMTP or booking-write path is enabled.
6. From Keith's account: send a synthetic query in `/demo/customer`, observe genuine Groq model/usage records and one delivered answer, then open the same PostgreSQL conversation in Inbox with its decision evidence. Test handoff, takeover and release. Verify editable voice drafts still require existing publication gates.
7. Verify automatic Insights once per changed fingerprint, cache reuse, feedback pin/reply persistence, usage export and desktop/mobile layouts. Do not infer success from `/api/health` alone.
8. Stop/restart the new cloud process after enqueue, after claim, after answer persistence and during synthetic delivery. Assert no lost jobs, duplicate visible messages or indefinitely stuck sends; assert bounded failures and manual recovery. Test two tabs simultaneously and a retry with the same request ID.
9. Leave it idle beyond both sleep thresholds, then repeat the customer-to-business workflow. Finally turn off Gabriel's computer and verify from a separate device/network that login, Groq processing and stored data still work. Only then call it independently hosted.

## Free alternative if Render fails

An available **Oracle Cloud Always Free Ampere A1 VM** can run the complete Next.js + persistent worker + PostgreSQL/pgvector architecture, avoiding the request-driven worker compromise. The current official allowance is **2 OCPUs / 12 GB total**, represented by 1,500 OCPU-hours / 9,000 GB-hours monthly, plus 200 GB combined block storage. Do not rely on older 4-OCPU/24-GB descriptions. Allocation is subject to home-region capacity, and idle instances can be reclaimed. [Oracle Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)

This has substantially more runtime headroom but adds Linux patching, firewall/TLS setup, PostgreSQL backups and recovery ownership. Use only explicitly Always Free-eligible shapes/storage and verify architecture-compatible images. Do not upgrade to Pay As You Go to resolve capacity shortages without separate approval. It remains a conditional alternative, not a provisioned or guaranteed free VM. If neither account offers eligible capacity, report that independent S$0 hosting is blocked rather than silently selecting paid infrastructure.
