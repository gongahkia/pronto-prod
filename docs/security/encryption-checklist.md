# Encryption Checklist

## Local Development

- Use local Docker Postgres for development data only.
- Do not place real client secrets in committed files.
- Keep `.env` ignored and use `.env.example` for names only.
- Use HTTPS tunnels only for short-lived local webhook testing.

## Staging

- Require TLS for all public endpoints.
- Set `PRONTO_SECRETS_KEY` to at least 32 bytes before saving provider or integration credentials.
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

## PRONTO_SECRETS_KEY Rotation

1. Schedule a maintenance window and pause credential edits.
2. Export current provider and integration credentials from the secrets manager or operator records.
3. Set the new `PRONTO_SECRETS_KEY` value in the runtime environment.
4. Re-save each provider and integration credential so it is encrypted with the new key.
5. Restart application workers and run provider/integration tests.
6. Remove the old key from runtime and secret-manager history according to policy.
