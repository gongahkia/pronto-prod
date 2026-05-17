# Incident Response Draft

## Incident Types

- Hallucination or scope breach.
- PDPA or suspected data breach.
- WhatsApp, Telegram, or email channel outage.
- LLM provider outage or quality regression.
- Integration failure affecting customer answers.

## Response Steps

1. Triage severity and affected clients.
2. Stop or disable the affected agent/channel if customer harm can continue.
3. Preserve relevant logs, messages, prompts, retrieved sources, and provider responses.
4. Notify the client owner with plain facts, known impact, and current mitigation.
5. Fix the immediate failure mode.
6. Review affected conversations for customer follow-up needs.
7. Write a post-mortem with root cause, corrective actions, owner, and due date.
8. Update evals, guardrails, docs, or client knowledge sources to prevent recurrence.

## PDPA-Specific Notes

- Escalate suspected personal-data exposure immediately to the DPO.
- Determine whether notification obligations are triggered.
- Document discovery time, affected data categories, affected individuals, containment actions, and client communications.

