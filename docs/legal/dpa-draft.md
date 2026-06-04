# Data Processing Agreement Draft

Working draft for Singapore pilots. This is not legal advice and should be reviewed by counsel before use.

## Roles

The client is expected to be the organisation deciding the purposes of processing its customer personal data. Pronto is expected to process personal data to provide the customer-service assistant and related support.

## Processing Purposes

Pronto may process personal data to:

- Receive and store customer messages.
- Generate grounded AI replies or escalations.
- Notify client owners of escalations.
- Maintain audit logs, reviews, CSAT, support records, and offboarding exports.
- Secure, debug, and improve the service within the client-agreed scope.

## Categories Of Data

- Customer names, handles, phone numbers, message content, and channel metadata.
- Client owner contact details and operational settings.
- Knowledge sources that may contain business or customer information if provided by the client.
- Review, escalation, audit, and CSAT data.

## Obligations

Pronto should:

- Process personal data only for documented purposes.
- Apply reasonable access controls, logging, TLS, credential redaction, and data retention limits.
- Keep customer message content out of application logs where feasible.
- Notify the client of suspected data incidents without undue delay.
- Assist with access, correction, deletion, and offboarding requests where technically feasible.
- Delete or return client customer data at offboarding according to the retention policy.

The client should:

- Provide required notices and consents for customer messaging channels.
- Avoid uploading unnecessary sensitive personal data.
- Keep escalation recipients and channel credentials accurate.
- Notify Pronto promptly of data subject requests affecting the service.

## Subprocessors

Expected subprocessors or infrastructure categories:

- Cloud hosting and managed database providers.
- AI model providers.
- Channel providers such as Meta WhatsApp Business Platform and Telegram.
- Error monitoring or log infrastructure if enabled later.

## Breach Notification

Use the incident response plan for triage. Singapore PDPC guidance should be checked when deciding whether and when notification is required.

## Sources

- PDPC guide on data protection clauses for processing agreements: https://www.pdpc.gov.sg/-/media/Files/PDPC/PDF-Files/Other-Guides/guide-on-dp-clauses-for-agreements-related-to-processing-of-personal-data-v1-0-%28200716%29.pdf
- PDPC guide on managing and notifying data breaches: https://www.pdpc.gov.sg/-/media/files/pdpc/pdf-files/other-guides/guide-on-managing-and-notifying-data-breaches-under-the-pdpa-15-mar-2021.pdf

