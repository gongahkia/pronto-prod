# OpenAI Data Residency Note

Working draft checked on 2026-06-04. This is not legal advice.

## Current Position

Pronto should treat OpenAI data residency as an eligibility-gated project setting, not a default guarantee. OpenAI's API data controls documentation says data residency controls are configured per project and that eligible customers must contact sales for access. The same documentation lists Singapore as supporting regional storage, but not regional processing, for supported API services and models.

For the local release:

- Keep `store: false` on Responses API calls.
- Avoid OpenAI-hosted vector stores for client knowledge in v1; Pronto uses local Postgres/pgvector.
- Keep customer message content out of logs through structured redaction.
- Record whether the client requires Singapore storage at rest before production.
- If Singapore data residency is required, create an eligible OpenAI project with Singapore data residency and configure the regional API domain when approved.

## Operational Caveats

- System data such as account, billing, analytics, and usage data may be outside the selected region under OpenAI's data residency limitations.
- Singapore storage does not currently mean Singapore inference processing under the OpenAI API documentation reviewed.
- Non-US data residency may require abuse monitoring controls approval and a Zero Data Retention amendment.
- Third-party tools, remote MCP servers, or external live-source integrations have separate data residency obligations.

## Sources

- OpenAI API data controls and data residency: https://platform.openai.com/docs/guides/your-data
- OpenAI Help Center note pointing API users to the platform docs as source of truth: https://help.openai.com/en/articles/10503543-data-residency-for-the-openai-api.doc

