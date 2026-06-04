# Prompt Caching Strategy

## Stable Prefix

Keep stable prompt content before dynamic turn content:

1. Product contract and safety boundary.
2. Client prompt preamble.
3. Brand voice document.
4. Few-shot examples.
5. Output schema.

Dynamic content should come later:

1. Recent messages.
2. Current customer question.
3. Retrieved source chunks.

## Current Local Release

Pronto does not rely on provider prompt-cache features yet. The local release prepares for caching by keeping the durable instruction structure stable and making source/chunk insertion explicit.

## Caveat

OpenAI's API data controls documentation notes that some prompt caching modes may require temporary application state and may affect Zero Data Retention eligibility. Re-check provider docs before enabling provider-side caching for clients with strict data controls.

Source: https://platform.openai.com/docs/guides/your-data

