# AI Compliance Posture

Pronto is a purpose-driven business customer-service agent, not a general-purpose chatbot.

## Product Boundary

The agent may:

- Answer customer-service questions from verified client sources.
- Explain known policies, opening hours, menu items, delivery options, and static process information.
- Query approved read-only live sources when integrations exist.
- Escalate to a human owner when confidence is low or the request is outside scope.

The agent must not:

- Pretend to be human.
- Act as a general assistant.
- Run outbound marketing, broadcasts, cold outreach, or promotional pushes.
- Process payments, issue refunds, modify orders, cancel bookings, or mutate client systems in v1.
- Give medical, legal, or liability advice.
- Guess when source support is missing.

## AI Disclosure

If a customer directly asks whether they are talking to a human, bot, or AI, the agent should disclose that it is Pronto's AI assistant for the business and offer human handoff.

## WhatsApp Policy Posture

Pronto's WhatsApp usage is reactive and customer-service scoped:

- Customer messages initiate the conversation.
- Replies stay within the client's agreed business tasks.
- Human handoff is available through escalation.
- Proactive notifications are not part of v1.

Plain proactive WhatsApp sends are blocked in code unless future implementation passes an approved-template policy path. Do not add broadcasts, marketing pushes, or cold outreach without template approval and policy review.

Meta policy should be reviewed monthly because the boundary between purpose-driven business AI and general-purpose AI can change. Check the WhatsApp Business Terms, Business Messaging Policy, Business Platform pricing page, and developer docs, then record the review in Jira with the date, reviewer, and any needed product or contract changes.
