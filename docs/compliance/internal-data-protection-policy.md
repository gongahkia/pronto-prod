# Internal Data Protection Policy Draft

Working draft for Singapore pilots. This is not legal advice.

## Principles

- Collect only data needed to run scoped customer-service workflows.
- Keep Pronto purpose-driven, not a general-purpose assistant.
- Store credentials outside source control.
- Redact secrets, phone numbers, and message bodies from logs.
- Escalate low-confidence, legal, medical, refund, booking mutation, and out-of-scope requests.

## Access Control

- Operator access is limited to Pronto team members who need it for setup, support, QA, or incident response.
- Client users access only their assigned client workspace.
- Production credentials should be rotated when team access changes.

## Retention

Use `docs/compliance/data-retention.md` unless a signed client agreement overrides it.

## Incidents

Use `docs/ops/incident-response.md` and `docs/ops/postmortem-template.md`. Suspected personal-data exposure must be escalated to the DPO immediately.

## Vendor And Channel Data

OpenAI, Meta, Telegram, hosting, database, logging, and future integration vendors each have their own data handling terms. Record vendor choices per client before production launch.

