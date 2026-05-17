# Pronto MVP Architecture

## Templated Core

The reusable core is shared across all clients:

- Prompt scaffolding with brand voice injection.
- Knowledge ingestion, chunking, embedding, retrieval, and source citation.
- Confidence checks and escalation logic.
- Channel adapters separate from agent logic.
- Standard integration patterns for read-only live sources.
- Escalation notification and owner handoff workflow.
- Operator and client dashboards.

## Request Flow

1. A channel webhook normalizes inbound customer messages.
2. Pronto deduplicates messages by channel and external message ID.
3. The conversation and customer message are stored.
4. Pre-generation guardrails check topic, sentiment, transactional action, and scope.
5. The customer message is embedded.
6. pgvector retrieves relevant knowledge chunks.
7. Retrieval confidence is checked against the client threshold.
8. The LLM provider drafts a structured answer or escalation decision.
9. Pronto requires source citations before sending any answer.
10. The agent message or escalation is stored.
11. The channel adapter sends a reply or owner notification.

## Provider Boundary

OpenAI is the first provider. The `LlmProvider` interface keeps generation and embeddings separate from channel and dashboard logic so Anthropic or Gemini can be added without rewriting the agent pipeline.

## Data Boundary

Each core record is client-scoped. Client users should only access their own client data. Operator users can configure and review all clients.

