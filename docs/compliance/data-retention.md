# Data Retention Draft

This draft defines default retention limits until superseded by signed client terms.

## Client Data

- Conversation history: retain while client is active, then export and delete within 30 days of offboarding.
- Knowledge sources: retain while client is active, then export and delete within 30 days of offboarding.
- Brand voice documents and client configuration: retain while client is active, then export and delete within 30 days of offboarding.
- Embeddings: delete alongside the knowledge chunks that produced them.
- Channel credentials: delete immediately during offboarding after channel shutdown is confirmed.

## Operational Data

- Audit logs: retain for 12 months unless client contract requires a different period.
- Error logs: retain for 90 days with customer content redacted where feasible.
- Agent traces and usage events: retain for 12 months unless client contract requires a different period.
- Security incident records: retain for 24 months.
- Aggregated business metrics: may be retained after removing client customer identifiers.

## Enforcement

Run `pnpm retention:prune` from the scheduler. Use `pnpm retention:prune --dry-run`
before changing retention windows.

Environment overrides:

- `PRONTO_RETENTION_CLOSED_MESSAGE_DAYS` defaults to 365.
- `PRONTO_RETENTION_AUDIT_LOG_DAYS` defaults to 365.
- `PRONTO_RETENTION_ERROR_EVENT_DAYS` defaults to 90.
- `PRONTO_RETENTION_AGENT_TRACE_DAYS` defaults to 365.
- `PRONTO_RETENTION_AGENT_USAGE_DAYS` defaults to 365.

## Deletion Confirmation

Offboarding must produce written confirmation covering:

- Conversation export delivered.
- Knowledge base export delivered.
- Brand voice and configuration export delivered.
- Integrations disabled.
- Credentials deleted.
- Client customer data deleted from Pronto systems.
