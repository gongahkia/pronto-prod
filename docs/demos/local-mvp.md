# PS.Cafe Raffles City local MVP

This is an **internal Pronto demo**, not a PS.Cafe messaging account. The
restaurant facts and unapproved demo voice are described in
[the outlet guide](ps-cafe-raffles-city.md). No Meta or Chope call is made by
the commands below. The Chope reader stays disabled; booking requests use the
verified outlet link or handoff. Reservation creation is unsupported.

## Start the isolated demo

Create and mark a disposable `pronto_test` database using the
[safe regression guide](../testing/safe-regression-baseline.md). Never use
the development `pronto` database or a staging URL. In each terminal:

```sh
export TMPDIR=/var/tmp
export PRONTO_TEST_DATABASE_URL=postgres://pronto_test:pronto_test@127.0.0.1:55433/pronto_test
export DATABASE_URL="$PRONTO_TEST_DATABASE_URL"
export PRONTO_PREFLIGHT_IGNORE_DOTENV=1
export PRONTO_SECRETS_KEY=local-test-secrets-key-with-more-than-32-characters
export AUTH_SECRET=local-test-auth-secret-with-more-than-32-characters
export APP_BASE_URL=http://127.0.0.1:3000
export PRONTO_LOCAL_EMAIL_ENABLED=1
export PRONTO_USE_MOCK_AI=1
pnpm test:db:verify
```

Use your marked database's actual loopback port in place of `55433`.
Then run `pnpm migrate:test` if needed, `pnpm seed:test`,
`docker compose --profile local-mail up -d mailpit`, then
`pnpm demo:ps-cafe:remove` and `pnpm demo:ps-cafe:setup` for a fresh run.
Mailpit listens only on loopback SMTP `1025` and
web UI [http://127.0.0.1:8025](http://127.0.0.1:8025). It needs no domain,
paid account or external SMTP credentials. In separate terminals run
`pnpm dev` and **`pnpm demo:worker`**. The demo worker verifies the marked
test database before starting and forces mock AI.

Submit a simulated inbound customer email:

```sh
pnpm demo:email:inject tests/fixtures/ps-cafe-hours.eml
pnpm demo:email:inject tests/fixtures/ps-cafe-booking.eml
pnpm demo:email:inject tests/fixtures/ps-cafe-escalation.eml
pnpm demo:email:inject tests/fixtures/ps-cafe-escalation-followup.eml
```

The injector parses RFC822/MIME, checks the configured support recipient,
then commits the normalized message and job. The worker uses the existing
agent/RAG and outbox; the reply appears in Mailpit. The injector does **not**
receive mail from an external mailbox. For another enquiry, create a local
`.eml` file addressed to `support@ps-cafe-demo.test` with a fresh `Message-ID`.
Injecting the same fixture twice deliberately returns a duplicate and creates
no second job.
The booking request uses the configured Chope link fallback; no live
availability is invented. The attachment-only message demonstrates handoff;
Mailpit then shows
the customer holding reply and a notification addressed to
`operator@ps-cafe-demo.test`. A subsequent customer reply with `In-Reply-To`
keeps the thread human-owned and produces no independent AI answer.

The escalation notification is now a durable staff job drained by the demo
worker. The demo contact is explicitly marked as an operator audience and its
action link requires operator login. Business staff destinations configured
through Tranche A receive the tenant-scoped client conversation link instead.
See [managed operations](../ops/managed-operations.md).

The operator can inspect the tenant's channels, conversation ownership,
escalations, worker heartbeat and outbound failures in the existing dashboard.
The WhatsApp, Instagram and Messenger demo channels remain **draft**. Their
signed fixture paths are exercised by the isolated integration tests; the
local procedure never sends a real Meta message.

## Business staff demonstration

The guarded demo setup also creates four **synthetic** staff identities with password
`pronto-ps-demo`: `responder@ps-cafe-demo.test`,
`approver@ps-cafe-demo.test`, `policy@ps-cafe-demo.test`, and
`staff@ps-cafe-demo.test`. They hold separate conversation, knowledge approval,
policy management, and ordinary staff permissions respectively. These are
internal test accounts only. Never use them with a real customer account.

Sign in as the responder at `/client` to see the four-destination business
portal. Open a human handoff from Needs Attention, claim it, reply, then
explicitly release it. The existing email escalation fixtures above provide a
safe local conversation and Mailpit captures the staff reply. Sign in as the
responder or ordinary staff member at `/client/knowledge` to suggest a
correction about the disputed reservation cutoff; it remains pending and cannot
change customer answers. The approver can review the exact revision, but this
does **not** state that the real restaurant has approved it. A Pronto operator
then stages the reviewed suggestion, performs a private test, obtains the
separate version-bound assistant approval, and publishes it. Avoid publishing
either conflicting cutoff as an authoritative fact. The fixture's existing
knowledge and Chope read-only fallback remain intact.

For a local staff configuration exercise, start the app with
`PRONTO_LOCAL_STAFF_COMMANDS=1` in the marked test database. Sign in as
`policy@ps-cafe-demo.test`, open `/client/contact-pronto`, send
`Change our escalation response target to 30 minutes`, review the old/new
proposal, and confirm. Settings then shows the persisted versioned target.
This interface uses authenticated synthetic identities and is disabled for
real messaging providers. See [the business experience guide](../ops/business-experience.md)
for exact command syntax, permissions and limitations.

Tranche C adds a guided source and reminder exercise at `/client/knowledge`
and `/client/settings`. Synthetic staff may submit a text source, a selectable-
text PDF, or a permitted public URL for review; the source stays out of active
RAG until exact business approval and Pronto publication. The public URL
operation itself requires a real public network request, so the deterministic
local acceptance test uses an injected HTML/DNS fixture instead. The
PS.Cafe 5:30pm versus 6:00pm cutoff remains disputed; asking a reservation
timing question creates a review item and does not release the human handoff.
The Mailpit test `pnpm test:local-mail` now also configures a synthetic
response target and verified responder mailbox, advances scheduled jobs in
the disposable database, and captures a reminder and backup email. See
[source review and timed notifications](../ops/knowledge-and-reminders.md).

Stop the app and worker, then run `pnpm demo:ps-cafe:remove`. The guarded
removal deletes only the marked demo tenant. `docker compose --profile
local-mail stop mailpit` stops the local mailbox.

## Repeatable acceptance checks

```sh
pnpm test:db
pnpm test:local-mail
```

`test:db` verifies the marked database and runs deterministic fake-provider
WhatsApp, Instagram Login, Facebook Login and Messenger flows plus Chope
capability/fallback fixtures. It cannot contact live providers. `test:local-mail`
also requires the local Mailpit container; its test guard permits loopback
ports `1025` and `8025` only for this opt-in run. It verifies real local SMTP
capture, same-sender threading, different-sender isolation, deduplication,
escalation notification and AI pause. Neither test proves an external email
mailbox or Meta account works.

Local support email uses the existing inbox, worker, RAG and outbox. The
`local_smtp` sender refuses production mode and requires
`PRONTO_LOCAL_EMAIL_ENABLED=1`; the public webhook rejects local mail. A real
support mailbox later needs an authorized provider account, verified inbound
signature/recipient mapping, scoped credentials, callback, domain policy and
provider-specific delivery evidence. This setup does not use a personal
Gmail account.
