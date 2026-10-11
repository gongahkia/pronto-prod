# PS.Cafe Raffles City: isolated Pronto demo

See [Chope demo availability reader](../integrations/chope-live-read.md) for
the separately enabled read-only connector. The demo seed leaves it disabled.

Research checked **11 October 2026**. This is a demonstration tenant, not a live
PS.Cafe channel. Chope authorization was separately summarized by the user on
11 October 2026; the hardcopy has not been inspected. Facts below are
paraphrased; no menu PDF or
Chope page is ingested wholesale.

## Curated outlet facts and provenance

| Fact | Source | Demo use |
|---|---|---|
| PS.Cafe Raffles City, 252 North Bridge Road, #03-37, Raffles City Shopping Centre, Singapore 179103 | [Official outlet page](https://www.pscafe.com/pscafe-raffles-city/) and [Chope outlet page](https://www.chope.co/singapore-restaurants/restaurant/ps-cafe-raffles-city) | Sourced knowledge and tenant profile |
| Standard daily hours 10:00am–10:00pm; last food order 9:00pm | [Official outlet page](https://www.pscafe.com/pscafe-raffles-city/) | Sourced knowledge; holiday exceptions require confirmation |
| All-day menu from 10:00am; weekend brunch 10:00am–4:00pm; sections include starters, mains, junior items, desserts and drinks | [Official outlet page](https://www.pscafe.com/pscafe-raffles-city/) and [official QR menu page](https://www.pscafe.com/pscafe-raffles-city-qr-food-menu) | Sourced menu overview, no item prices |
| Chope labels the outlet vegetarian friendly and lists Red Pesto Rigatoni | [Chope outlet page](https://www.chope.co/singapore-restaurants/restaurant/ps-cafe-raffles-city) | Cautious dietary answer; staff must verify current ingredients, cross-contact and strict requirements |
| Concierge +65 6708 9288, listed 10:00am–10:00pm daily; general email concierge@pscafe.com | [Official outlet page](https://www.pscafe.com/pscafe-raffles-city/) and [official contact page](https://www.pscafe.com/contact-us) | Contact fallback |
| Restaurant directs customers to Chope for reservations; Chope listing is outlet-specific | [Official outlet page](https://www.pscafe.com/pscafe-raffles-city/) and [Chope outlet page](https://www.chope.co/singapore-restaurants/restaurant/ps-cafe-raffles-city) | Verified link; provisional availability only when freshly read; no booking claim |
| Chope listing says reservations are held 15 minutes; dining session 1.5 hours; groups above 8 require card details and may incur a S$40/person late-cancellation or no-show fee; 15+ are event bookings | [Chope outlet page](https://www.chope.co/singapore-restaurants/restaurant/ps-cafe-raffles-city) | **Owner review required before automated replies**; not included as approved RAG facts |

### Blocking knowledge conflict

The [official outlet page](https://www.pscafe.com/pscafe-raffles-city/) says
weekend/public-holiday reservations start at **5:30pm**; the [Chope listing](https://www.chope.co/singapore-restaurants/restaurant/ps-cafe-raffles-city)
says **6:00pm**. The demo stores both claims as source metadata and omits both
times from retrievable text. The tenant profile marks the cutoff as unresolved.
PS.Cafe should approve the correct rule before it appears in customer answers.
Walk-ins are described as the option before the cutoff on both sources, but
the disputed time must not be quoted.
The demo routes groups of nine or more to a human as a conservative workflow
default; the restaurant has not yet approved that threshold.

Current menu item availability, prices, allergen suitability, public-holiday
hours, outlet-specific cancellation terms and group-policy wording still need
restaurant review. Do not infer them from older PDFs or other outlets.
The brand voice is a **Pronto demonstration default**, explicitly marked
unapproved, not an assertion about PS.Cafe's official style.

## Reproducible setup and removal

Use only a newly created and marked isolated PostgreSQL `pronto_test` database
as specified in [the safe testing guide](../testing/safe-regression-baseline.md).
Both environment variables must contain the **same** explicit loopback URL.
Run `pnpm migrate:test` first if this database has no schema.

```sh
export PRONTO_TEST_DATABASE_URL=postgres://pronto_test:pronto_test@127.0.0.1:55433/pronto_test
export DATABASE_URL="$PRONTO_TEST_DATABASE_URL"
pnpm test:db:verify
pnpm demo:ps-cafe:setup
pnpm demo:ps-cafe:setup # repeat to verify idempotence
pnpm demo:ps-cafe:remove
```

The script verifies the database marker before either mutation. It upserts
one fixed, marked tenant, three short sourced knowledge records with mock
embeddings, one agent config, one demonstration brand-voice document and two
**draft** Meta channels. It never creates live credentials or activates a
channel. It refuses an occupied slug or ID that belongs to non-demo data.
Removal deletes only the marked demo tenant and its cascading test records.
The demo uses the existing pgvector retrieval and agent path; it does not add
PS.Cafe logic to the production agent.

## Local demonstration

With the verified DB URL exported, run:

```sh
TMPDIR=/var/tmp pnpm test:db
```

`tests/integration/ps-cafe-demo.test.ts` activates **fixture-only** encrypted
channel credentials in the disposable DB, signs WhatsApp/Instagram payloads,
passes them through the real webhook, durable job, worker and RAG paths, and
uses a fake Graph sender. It covers hours, dietary/menu, available/unavailable
**simulated** slots, disabled production booking capability, escalation,
tenant isolation, duplicate ingress, provider failure fallback and the
cutoff conflict. The fake availability result carries outlet, date, party
size, time slots, Singapore timezone, source, timestamp and status. The
default Chope adapter advertises no availability or write capability. The
separately enabled browser adapter is read-only; normal tests do not contact Chope.

## Chope access boundary and activation checklist

Chope's [affiliate page](https://www.chope.co/singapore-restaurants/pages/affiliateprogram)
says API tools may be provided after affiliate acceptance. No public API
contract or credentials were found. On 11 October 2026 the user summarized a
written Chope letter as permitting demo scraping and a booking bot. The
hardcopy has not been inspected; exact outlet, rate, authentication and write
terms remain unverified. A conservative read-only browser connector was added
under that stated permission. Booking writes remain disabled. See the linked
reader guide for the request boundary and remaining agreement review.

Before broader use or any booking write, obtain:

1. Review the written Chope authorization covering Pronto, this outlet, the
   exact read and write operations, permitted method and rate cap.
2. Official versioned API documentation, sandbox base URL and test account;
   authenticate with scoped, encrypted credentials.
3. Chope's outlet ID mapping and agreement on rate limits, data freshness,
   slot semantics, customer fields, idempotency, timeout reconciliation,
   confirmation status and cancellation/change rules.
4. Restaurant approval of the disputed cutoff, group and cancellation rules,
   knowledge facts and demonstration voice.
5. Authorized Meta sandbox account/token, callback subscriptions and channel
   mappings before any real WhatsApp or Instagram test. Do not reuse the draft
   fixture channels for live traffic.

Even with a read API, availability is provisional until a provider confirms a
booking. The current production path sends the verified outlet link or
escalates; it does not execute reservation mutations. Never test a write with
a live reservation or a real customer identity without specific authorization.
