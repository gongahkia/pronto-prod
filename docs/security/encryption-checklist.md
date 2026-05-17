# Encryption Checklist

## Local Development

- Use local Docker Postgres for development data only.
- Do not place real client secrets in committed files.
- Keep `.env` ignored and use `.env.example` for names only.
- Use HTTPS tunnels only for short-lived local webhook testing.

## Staging

- Require TLS for all public endpoints.
- Store database volumes on encrypted infrastructure.
- Store channel credentials and provider API keys outside source control.
- Restrict database access to application runtime and authorized operators.
- Rotate staging credentials after demos involving external parties.

## Production

- Require TLS for all web, webhook, and API traffic.
- Use encrypted managed Postgres storage.
- Use a secrets manager for provider keys, channel tokens, app secrets, and auth secrets.
- Enable database backups with encryption.
- Restrict direct database access with least privilege.
- Log secret access and rotation.
- Redact phone numbers, customer message bodies, and provider credentials from logs.

