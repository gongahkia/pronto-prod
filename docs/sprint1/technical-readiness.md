# Sprint 1 technical readiness

## Safe local run

Use the disposable, marked PostgreSQL database in
[`docs/testing/safe-regression-baseline.md`](../testing/safe-regression-baseline.md).
After `pnpm migrate:test` and `pnpm seed:test`, keep both
`DATABASE_URL` and `PRONTO_TEST_DATABASE_URL` set to that verified URL. Set
`PRONTO_USE_MOCK_AI=1`, `AUTH_SECRET`, `PRONTO_SECRETS_KEY`, and
`APP_BASE_URL=http://localhost:3000`. Start `pnpm dev` in one terminal and
`pnpm worker` in another, only after checking the DB URLs. For tests use
`pnpm test:db`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, then
`pnpm test:e2e` with the guarded environment described in the testing guide.

`/api/health` checks the web process. `/api/readiness` checks secrets, base
URL, mock-AI setting, tenant SQL gate, PostgreSQL, and a worker heartbeat
newer than 60 seconds. The worker heartbeat begins after a successful cycle.
Run migrations before either process. The web and worker must use the same
database and encryption key.

## Webhook and worker lifecycle

Next.js routes authenticate the raw body before parsing and require an active
channel and matching business account/phone number. They commit a customer
message and `inbound_jobs` row, then return without model inference or Graph
sends. The worker claims jobs in conversation order, recovers expired leases,
and retries with bounded backoff. Dead jobs appear in the operator client
workspace. Existing customer messages before migration 032 are backfilled as
completed because their prior delivery outcome cannot be safely inferred;
review historical failures manually.

The outbox stores provider message IDs when supplied. WhatsApp status events
update matching tenant/channel rows. Explicit provider 429 rejections are
retryable; permanent policy/4xx failures are dead. HTTP 408/5xx, transport
errors, an expired in-flight send, or ambiguous acceptance are `uncertain` and
need manual provider reconciliation. Never
blindly replay `uncertain` rows. Human-owned conversations suppress AI replies,
and resolved conversations stay closed until an authorized release action.

## Meta setup and verification limit

WhatsApp requires a Meta business portfolio, WhatsApp Business Account,
registered business phone-number ID, subscribed `messages` webhook,
`whatsapp_business_messaging` access, app secret, verification token, and a
valid send token. Configure the channel's number ID, token and app secret in
encrypted credentials; configure the verify token through the channel form.
Use `/api/webhooks/whatsapp/<channelId>` as the HTTPS callback. Free-form
outbound text requires a recent customer message; approved templates use the
template payload and need the correct name and language. Pronto uses the
provider event timestamp for the free-text window and fails closed when it is
missing. Check the configured
Graph API version before activation. The old `v20.0` local setting expired on
24 September 2026; outbound sends and channel preflight reject it. Set a
supported version such as `v25.0` and confirm it with a permitted test account.

Instagram currently uses **Facebook Login with a linked Facebook Page** and
a manually provisioned Page access token, plus the Instagram professional
account ID. Personal accounts and Instagram Login OAuth are unsupported.
Configure the professional account ID, Page token, app secret, and verify token
for `/api/webhooks/instagram/<channelId>`. Obtain the applicable Instagram
messaging permission and webhook subscription in the Meta app; complete App
Review/Advanced Access and business verification as Meta requires for
non-role users. The customer must initiate the conversation. Confirm actual
webhook `entry.id`, recipient IDs, token scope, and send endpoint with a
permitted test account before enabling a customer channel.
Set `META_GRAPH_VERSION` to a supported version; `v20.0` is rejected.

The local demonstration tests in `tests/integration/meta-rag-demo.test.ts`
exercise signed webhook -> durable job -> mock embedding/model with real
pgvector retrieval -> queued answer -> fake Graph transport. They are **mock
verified**, not sandbox or live provider verification. No Meta credential or
customer message was used during this sprint.

## Chope boundary

Chope's public affiliate page says API integration may be offered after
acceptance, but this repository has no authorized Chope endpoint contract or
credentials. The production connector advertises no availability or mutation
capabilities and performs no Chope requests. A deterministic fake under
`tests/fixtures/fake-chope.ts` tests reservations without production data.
The agent checks the connector's advertised availability capability; only an
authorized adapter with that capability is asked for availability. Even then,
an availability result is presented as provisional and no booking mutation is
made by the current agent path.

An operator may configure an exact restaurant outlet ID and manually checked
Chope booking URL on the client workspace. The agent parses Singapore local
date, time and party size, then sends that link with an explicit instruction
to check and confirm on Chope. Without a verified link it escalates. It never
claims that Pronto created or confirmed a booking.

To implement a direct connector later, obtain from Chope: written partner or
merchant authorization; official API specification and sandbox base URL;
scoped credentials; restaurant and outlet IDs; supported read/create/change/
cancel operations; rate limits; idempotency and timeout semantics; booking
confirmation fields; and a permitted sandbox/test account. Verify each
operation against that contract before advertising it.

## Activation gates

CI audits dependencies at moderate severity. It temporarily excludes two
unfixed advisories by exact CVE: CVE-2026-93687 in `braces`, reached through
the development-only Next ESLint plugin, and CVE-2026-97058 in `sprintf-js`,
reached through Mammoth's command-line argument parser. Pronto imports
Mammoth's library for document conversion and does not invoke its CLI. All
other reported advisories were resolved with same-major dependency updates or
targeted overrides. Recheck these exceptions when a patched upstream release
is available; the ordinary audit command still reports them.

- Run `pnpm channels:encrypt-credentials` only against the intended environment
  after a database backup and explicit URL check. It encrypts legacy credentials
  and webhook secrets in `settings`. Then run `pnpm staging:preflight`; active
  Meta channels with either plaintext form are blocked.
- Confirm a worker heartbeat and zero unexpected `dead` inbound or
  `uncertain` outbound rows for the tenant before traffic shift.
- Run the signed Meta callback and outbound tests with authorized sandbox
  accounts before calling either channel sandbox verified.
- Keep private order/tracking lookups disabled until requester ownership is
  checked against the provider record.
