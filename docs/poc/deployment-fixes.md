# POC deployment fixes

27 October 2026. These changes prepare the existing protected synthetic POC for
deployment; they do not provision or deploy a cloud service.

## Clean image build

The Render Dockerfile no longer copies the ignored, generated `next-env.d.ts`
from the host. Next.js generates it inside the build. A separate CI job builds
that exact Dockerfile immediately after checkout, before any host-side Next.js
command, then checks the container's health and login routes.

## Groq-only knowledge publication

Apply migrations through **053_demo_text_knowledge.sql** with the direct
administrative database connection before updating the app or bootstrapping a
new demo. Existing vectors and indexes are preserved. The migration permits a
missing vector only for this exact synthetic tenant's explicitly marked
`local_text` chunks; their embedding model is `none` and dimensions are zero.
Draft chunks now retain their indexing metadata through publication. Vector
search excludes chunks without vectors, including its keyword candidate path.

Inside the verified local or protected customer-demo boundary, staging a source
or correction prepares text chunks without calling any embedding provider.
Ordinary businesses retain their configured embedding pipeline. New protected
bootstrap fixtures also store actual text chunks with no placeholder vectors.
Optional Gemini indexing remains a separate, explicitly configured operation.

Source review, assistant-revision approval and operator publication remain
separate gates. Pending edits leave the last published version active. The
protected bootstrap still grants responders only conversation capabilities;
an operator must separately grant an invited business reviewer
`knowledge.approve` with authorization evidence to demonstrate publication.

Protected preflight accepts curated fixtures and synthetic sources with real
review/publication provenance. It checks the retained source version, reviewed
revision and reviewer identity, not just an `approvedBy` metadata field. Archive
history and pending revisions of a published source retain the previous review
evidence. Unreviewed content and forged publication metadata fail preflight.

## Readiness

For the protected demo, `/api/readiness` uses the same Groq configuration and
approved-published-knowledge checks as creating a customer conversation. Missing
keys, missing opt-ins, absent approved knowledge, invalid demo identity or mock
mode return HTTP 503 with only `{"status":"not_ready"}`. These checks do not
call an inference or embedding API, and cannot establish live provider quota or
API acceptance. `/api/health` remains a lightweight liveness check.

The actual hosted sleep/restart and customer-to-business walkthrough in the
[deployment acceptance plan](render-neon-free-assessment.md) still applies.

## Verification

- TypeScript, ESLint, CI YAML parsing and `git diff --check` passed.
- The complete Vitest run with PostgreSQL enabled passed **725 tests**, with
  **8 skipped**, on a newly marked disposable PostgreSQL 16/pgvector database
  migrated through 053. Provider traffic remained blocked by the safety harness;
  the workflow tests inject fake model decisions. The run used CI's
  `APP_BASE_URL=http://localhost:3000`, one worker and 30-second local test/hook
  timeouts on the busy host. The existing `test:db` script hardcodes a different
  loopback hostname, so verification used the equivalent direct Vitest command
  with the same database safety settings and fixture origin as CI.
- Five new PostgreSQL cases cover text-only publication and delivery, separate
  source/assistant approvals, stale revisions, old live content during review,
  corrections, archive, forged provenance and cross-business storage rejection.
  Existing embedding vectors remained unchanged.
- The existing unknown-question provider fixture also failed on the untouched
  baseline because it unconditionally returned opening hours. Its fake model
  now explicitly returns an unknown-fact handoff; the regression still checks
  escalation reasons and the absence of embedding calls.
- The final Render image built from an isolated source context without
  `next-env.d.ts`, `.next`, host dependencies or dotenv files. Under container
  limits of **512 MiB / 0.1 CPU**, health, login and a generated static asset
  returned HTTP 200; unconfigured readiness returned HTTP 503 with the aggregate
  response only. This was a startup/HTTP smoke check, not a hosted load test.

Temporary verification containers were removed. No cloud resources, live
provider configuration or persistent demonstration database were changed.
