 Audit complete. Drops: agent #2 wrongly flagged "missing tables" — they exist in migrations 009/012/013. RBAC: operators are by-design global, so operator routes
   lacking canAccessClient is hygiene-only.                                                                                                                        
                                                                                                                                                                   
  Beyond AUDIT.md — Additional findings                                                                                                                            
                                                                                                                                                                   
  Security (verified high-severity)                                                                                                                                
                                                                                                                                                                   
  1. SSRF in website ingestion — src/lib/knowledge/website.ts fetches operator/client-supplied URLs with no private-IP/DNS-rebinding/localhost blocklist. An       
  operator can crawl http://127.0.0.1:5432, metadata endpoints (169.254.169.254), or internal services. Fix: resolve hostname, reject                              
  RFC1918/loopback/link-local/IPv6 ULA before fetch; redirect: "manual" with hop cap.                                                                              
  2. assertSameOrigin() called on webhook routes — e.g. src/app/api/webhooks/telegram/[channelId]/route.ts:17. External providers send no Origin; the check is a
  no-op there but suggests confused trust model. [Inference] If assertSameOrigin returns false on null-origin, no webhook would ever fire — so check current       
  behaviour. Either way: remove from webhook routes; signature verification is the boundary.                                                                       
  3. No webhook replay protection — all of src/app/api/webhooks/** verify HMAC but ignore timestamp + nonce. A captured payload replays indefinitely. Add ±5min    
  window check on provider timestamp headers + processed-message-ID dedup (some channels already have idempotency tables — extend to all).                         
  4. PRONTO_SECRETS_KEY integrity not enforced — src/lib/integrations/credentials.ts, src/lib/llm/credentials.ts SHA-256 the env material with no min-length /     
  entropy validation, no documented rotation path. Short keys silently weaken AEAD. Validate ≥32 bytes at boot; document rotation runbook.                         
  5. No retention / partitioning on volume tables — messages, audit_logs, error_events, agent_traces, agent_usage_events grow unbounded. At 1k msgs/day × 12 months
   × 10 clients = ~3.6M rows/table. Add monthly RANGE partitioning + drop-old job; aligns with the PDPA retention TODO that's marked done but has no schema        
  enforcement.                                                                                                                                                     
  6. Multi-tenancy is convention-only — no Postgres RLS. ~88 queries hand-add WHERE client_id = $X. One missed join leaks. Either enable RLS with SET LOCAL        
  app.client_id per request, or add a query-builder gate that asserts every statement touches a tenancy column.                                                    
  7. seed script not gated on NODE_ENV — running pnpm seed in prod plants operator@pronto.sg / pronto-operator. Even with AUDIT.md's login-page hide, the          
  credentials exist. Refuse to run unless NODE_ENV !== "production" or --force flag.                                                                               
  8. DB pool has no timeouts — src/lib/db.ts Pool max=10 but no idleTimeoutMillis, connectionTimeoutMillis, no leak detector. Long-held queries → request stalls.  
  Set explicit timeouts + log connections held >30s.                                                                                                               
                                                                  
  Agent / LLM (high)                                                                                                                                               
                                                                  
  9. No cost / loop / wall-clock cap on agent runs — src/lib/agent/engine.ts records usage in costing.ts post-hoc but never checks budget pre-call, has no         
  max-iterations on retrieval+generate cycles, no AbortController timeout. A runaway prompt = unbounded spend per conversation. Add hard caps:
  max_tokens_per_conversation, max_iterations, timeout_ms.                                                                                                         
  10. Provider failover always falls back to OpenAI — src/lib/llm/catalog.ts:64 failoverModelChoice() returns OpenAI regardless of which provider failed. If OpenAI
   is itself down, no second fallback. Define a failover chain per origin provider; circuit-break after N consecutive failures.                                    
  11. Token counting is char-based estimation — src/lib/costing.ts:28 ~chars/4. Drifts 20–40% from provider truth at long contexts. Use provider-reported usage
  from response payloads (every adapter already gets it); only fall back to estimate when streaming chunked.                                                       
  12. Retrieved chunks treated as instructions — src/lib/llm/prompt.ts concatenates chunk text into the system/user prompt without delimiters or "the following is
  untrusted reference material" framing. A poisoned knowledge source (CSV row, scraped page) can do prompt injection. Fence with explicit role + escape, and       
  instruct the model to ignore directives inside chunks.          
  13. No token budget allocation — prompt.ts includes all retrieved chunks, full brand voice, all few-shots verbatim. No per-section cap → silent truncation by    
  provider. Compute budget = context_window − reserve_output, allocate by priority.                                                                                
  14. max_tokens=800 hard-coded in both Anthropic and OpenAI adapters — src/lib/llm/anthropic.ts:60, openai.ts. Long-form policy answers get truncated
  mid-sentence. Make per-task configurable.                                                                                                                        
  15. Self-check + guardrails are English-only — src/lib/agent/self-check.ts stopwords set is hardcoded English, guardrails.ts regex uses ASCII \b.
  Mandarin/Malay/Tamil escalations slip through guardrails and inflate self-check overlap scores artificially. Multilingual support is in the TODO as completed but
   doesn't extend here.                                           
  16. Top-k=5 with no MMR / dedup — src/lib/knowledge/retrieve.ts:254. Three near-duplicate chunks burn the budget. Add MMR or cosine-distance dedup before        
  truncation.                                                                                                                                                      
  17. Stale embeddings on model change — agent_configs.embedding_model can be swapped but knowledge_chunks.embedding has no embedded_with_model column. Old vectors
   silently mix with new ones. Add column + reindex job + read-side filter until backfill completes.                                                               
                                                                  
  Database / schema                                                                                                                                                
                                                                  
  18. knowledge_chunks.embedding vector(1536) hard-coded — db/migrations/001_initial.sql. Switching to e.g. text-embedding-3-large (3072) requires a schema        
  migration. Either pick a generous fixed dim and pad, or move to multiple tables per model.
  19. outbound_messages.idempotency_key UNIQUE without client_id — db/migrations/007_outbound_messages.sql:12. Cross-tenant collision possible. Switch to composite
   (client_id, idempotency_key).                                                                                                                                   
  20. No ISOLATION LEVEL set on transactions — src/lib/db.ts:35 defaults to READ COMMITTED. Multi-step writes (escalation claim → audit, knowledge ingest → chunks
  → embeddings) can race. Use SERIALIZABLE for these specific txs with retry-on-40001.                                                                             
  21. agent_traces ivfflat with lists=32 — db/migrations/022_agent_traces.sql:37. Recall-quality drops sharply past ~100k rows. Move to HNSW or bump lists with
  documented re-train cadence.                                                                                                                                     
  22. conversations unique (channel_id, external_thread_id) blocks recreation — recreated channel + same external thread → duplicate-key error or ghost rows. Add
  deleted_at soft-delete and include in uniqueness.                                                                                                                
  23. Missing covering index for assigned_to_user_id + status + created_at desc — db/migrations/021_escalation_assignment.sql covers part. The "my open
  escalations" view will scan. Composite index.                                                                                                                    
  24. message.body allows empty string — no CHECK (length(body) > 0). Whitespace-only messages slip through; minor.
                                                                                                                                                                   
  API surface                                                                                                                                                      
                                                                                                                                                                   
  25. Operator routes don't call canAccessClient defensively — src/app/api/operator/knowledge/route.ts and peers rely on requireUser("operator") only. Today       
  operators are global by design (rbac.ts:4), so not a leak — but if you ever split operators-by-portfolio, every operator route silently keeps full access. Make
  canAccessClient(user, clientId) mandatory at the gateway even when it currently always returns true.                                                             
  26. No edge middleware for auth — every page/route re-invokes requireUser deep in the handler. Add src/middleware.ts that 302s unauthenticated requests to /login
   before render. Saves DB hits + cleans up the unauth-bounce path.                                                                                                
  27. provider-test returns raw provider error bodies — src/app/api/operator/provider-test/route.ts:101. Meta/Anthropic occasionally echo partial bearer headers in
   4xx bodies. Pipe through redactErrorMessage() (already exists for logger).                                                                                      
                                                                  
  Frontend / UX                                                                                                                                                    
                                                                  
  28. Form double-submit not prevented anywhere — knowledge upload, client create, channel save have no useFormStatus() or button-disable. Multi-click → duplicate 
  sources, duplicate clients. Add disabled={pending} via useFormStatus.
  29. lucide-react imported per-icon but not tree-shaken on older bundlers — verify the bundler is doing per-icon ESM. If not, full pack ships. Use                
  lucide-react/icons/<name> paths or barrel-import sanity check.                                                                                                   
  30. mammoth and pdf-parse are server-only but no import "server-only" guard — src/lib/knowledge/parse-upload.ts. A future accidental client import balloons the
  bundle. Add the guard.                                                                                                                                           
  31. No relative-time live tick — "3 min ago" stays "3 min ago" on long-mounted pages. Add a useNow(60_000) hook re-rendered every 60s where it matters
  (escalation list).                                                                                                                                               
  32. Vitest has no coverage thresholds — vitest.config.ts plain. Add coverage: { thresholds: { lines: 80, branches: 70 } } and a CI gate.
  33. No CI workflow files present — .github/workflows missing. pnpm typecheck, lint, test, build run only locally. Add a CI pipeline before pilot launch.   
