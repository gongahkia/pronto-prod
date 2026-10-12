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

The operator can inspect the tenant's channels, conversation ownership,
escalations, worker heartbeat and outbound failures in the existing dashboard.
The WhatsApp, Instagram and Messenger demo channels remain **draft**. Their
signed fixture paths are exercised by the isolated integration tests; the
local procedure never sends a real Meta message.

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
