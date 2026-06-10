(A) 2026-05-17 Wire real live provider credentials and complete at least one PRONTO_USE_MOCK_AI=0 local staging run; readiness UI/checklist exists but requires keys +ProntoMVP @engineering phase:pilot
(A) 2026-05-17 Configure live Meta WhatsApp Cloud API app, phone number ID, app secret, access token, and webhook verify token; channel readiness UI exists but requires real Meta values +Channels @engineering phase:pilot
(A) 2026-05-17 Configure live Telegram bot token, webhook secret, and HTTPS tunnel registration; channel readiness UI exists but requires real Telegram values +Channels @engineering phase:pilot
x 2026-05-17 (A) 2026-05-17 Add staging environment variables checklist for OpenAI, WhatsApp, Telegram, auth secret, app base URL, and database URL +Ops @engineering phase:pilot
x 2026-05-17 (A) 2026-05-17 Build golden eval set for opening hours, menu, reservation explanation, refund complaint, unknown policy, allergy, urgency, and out-of-scope requests +Pilot @quality phase:pilot
x 2026-05-17 (A) 2026-05-17 Add automated eval runner that replays golden customer questions against seeded client knowledge and records answer versus escalation +Pilot @quality phase:pilot
x 2026-05-17 (A) 2026-05-17 Add eval assertions that every answer includes cited source chunks and every unsupported claim escalates +AgentCore @quality phase:pilot
x 2026-05-17 (A) 2026-05-17 Add conversation review labels for answered correctly, should have escalated, over-escalated, hallucinated, and needs knowledge update +Dashboard @quality phase:pilot
x 2026-05-17 (A) 2026-05-17 Implement escalation claim, owner takeover, owner reply logging, and escalation resolution states +Escalation @engineering phase:pilot
x 2026-05-17 (A) 2026-05-17 Add owner handoff response path so resolved escalations can send an owner-authored reply back to the original customer channel +Escalation @engineering phase:pilot
x 2026-06-04 (A) 2026-06-04 Make escalation owner reply and resolution idempotent around outbound sends so a successful customer send cannot be lost if the DB update fails afterward +Escalation @engineering phase:pilot
x 2026-06-04 (A) 2026-06-04 Surface owner-resolution outbound outbox status in client and operator escalation history, including failed-send retry and clear not-sent copy +Escalation @dashboard phase:pilot
x 2026-06-04 (A) 2026-05-17 Add webhook retry handling and race-safe idempotent processing for duplicate WhatsApp and Telegram delivery attempts, including concurrent duplicate insert tests +Channels @engineering phase:pilot
x 2026-05-17 (A) 2026-05-17 Add unsupported media handling for images, audio, files, stickers, locations, and contact cards with safe escalation or fallback copy +Channels @engineering phase:pilot
x 2026-05-17 (A) 2026-05-17 Add channel health checks for webhook verification, credential validity, outbound send success, and recent delivery failures +Channels @engineering phase:pilot
x 2026-05-17 (A) 2026-05-17 Add channel setup UI copy for Meta webhook URL, Telegram webhook URL, local HTTPS tunnel, and secret headers +Channels @docs phase:pilot
x 2026-06-04 (A) 2026-05-17 Add production-safe webhook logging with payload redaction for customer phone numbers and message content +Security @engineering phase:pilot
x 2026-06-04 (A) 2026-06-04 Add webhook batch partial-failure handling so one bad inbound message cannot cause already-processed messages in the same provider delivery to be retried blindly +Channels @engineering phase:pilot
x 2026-05-17 (A) 2026-05-17 Add per-client rate limits and inbound message size limits for webhook and console endpoints +Security @engineering phase:pilot
x 2026-06-10 (B) 2026-06-04 Move rate limits from process memory to a shared store before multi-instance or serverless deployment +Security @engineering phase:tighten
x 2026-06-04 (A) 2026-05-17 Add real website URL ingestion with crawl depth controls, static content extraction, and robots-aware warnings stored on source metadata +RAG @engineering phase:pilot
x 2026-06-04 (A) 2026-06-04 Surface knowledge-source metadata warnings in client and operator source detail pages, especially website crawl robots and fetch warnings +RAG @dashboard phase:pilot
x 2026-05-17 (A) 2026-05-17 Add uploaded document ingestion for PDF, DOCX, TXT, Markdown, and CSV knowledge sources +RAG @engineering phase:pilot
x 2026-05-17 (A) 2026-05-17 Add menu or product CSV ingestion mapped to structured source metadata for F&B and e-commerce demos +RAG @engineering phase:pilot
x 2026-06-04 (A) 2026-05-17 Add knowledge source versioning so policy changes can be traced to the exact answer source +RAG @engineering phase:pilot
x 2026-06-04 (A) 2026-06-04 Add operator-scoped knowledge source view, edit, and delete screens so Pronto admins can fix client knowledge without switching into a client session +RAG @dashboard phase:pilot
x 2026-06-05 (A) 2026-05-17 Add knowledge refresh workflow for monthly check-ins and client policy updates +RAG @ops phase:pilot
x 2026-06-04 (A) 2026-05-17 Add per-client retrieval threshold UI and pilot tuning history +AgentCore @dashboard phase:pilot
x 2026-06-04 (A) 2026-05-17 Add prompt preview UI showing system preamble, brand voice, escalation rules, and allowed scope +AgentCore @dashboard phase:pilot
x 2026-06-04 (A) 2026-05-17 Add brand voice builder from website copy, past chats, marketing copy, and founder writing samples +BrandVoice @engineering phase:pilot
x 2026-06-04 (A) 2026-05-17 Add editable brand voice document with formality, energy, vocabulary, response patterns, and banned phrases +BrandVoice @dashboard phase:pilot
x 2026-06-04 (A) 2026-05-17 Add few-shot response examples per client and include them in prompt construction +BrandVoice @engineering phase:pilot
x 2026-06-04 (A) 2026-05-17 Add multilingual behavior tests for English, Mandarin, Bahasa Melayu, and Singapore code-switching +AgentCore @quality phase:pilot
x 2026-05-17 (A) 2026-05-17 Add AI disclosure behavior when a customer directly asks whether the agent is human +Compliance @engineering phase:pilot
x 2026-06-04 (A) 2026-05-17 Wire per-client topic guardrail configuration from agent_configs.escalation_rules into pre-generation guardrails for complaints, refunds, medical, legal, bookings, payments, severe allergies, and out-of-scope requests +AgentCore @engineering phase:pilot
x 2026-06-05 (A) 2026-06-05 Add React Flow triage editor with channel, decision, note, custom mapped decision, and compiled guardrail publishing for client/operator flow configuration +AgentCore @dashboard phase:pilot
x 2026-05-17 (A) 2026-05-17 Add sentiment trigger detection for frustration, urgency, anger, repeated unanswered questions, and negative delivery experiences +AgentCore @engineering phase:pilot
x 2026-06-04 (A) 2026-05-17 Add explicit post-generation self-check step beyond citation validation that verifies every drafted answer is traceable to retrieved static or live sources +AgentCore @engineering phase:pilot
x 2026-06-04 (A) 2026-05-17 Add hallucination incident workflow with severity, root cause, fix owner, and post-mortem notes +Quality @ops phase:pilot
x 2026-06-04 (A) 2026-05-17 Add pilot pass/fail dashboard for escalation accuracy, CSAT baseline, zero hallucinations, and launch readiness +Pilot @dashboard phase:pilot
x 2026-06-04 (A) 2026-05-17 Add time-to-live-agent target tracking from signed contract to production launch with target under 7 days +Metrics @dashboard phase:pilot
x 2026-06-04 (A) 2026-05-17 Add time-to-first-pilot-conversation metric +Metrics @dashboard phase:pilot
x 2026-06-04 (A) 2026-05-17 Add time-to-first-response metric for customer-facing conversations +Metrics @dashboard phase:pilot
x 2026-06-04 (A) 2026-05-17 Add escalation accuracy metric based on conversation review outcomes +Metrics @dashboard phase:pilot
x 2026-06-04 (A) 2026-06-04 Align dashboard open/actionable escalation metrics with active triage semantics, including claimed escalations and failed owner-reply outbox rows +Metrics @dashboard phase:pilot
x 2026-06-04 (A) 2026-05-17 Add customer-facing CSAT collection hook for agent-handled conversations +Metrics @engineering phase:pilot
x 2026-06-04 (A) 2026-05-17 Add gross margin tracking per client with retainer, amortized setup, LLM cost, hosting cost, and integration cost +Metrics @business phase:pilot
x 2026-06-04 (A) 2026-05-17 Add token usage and estimated LLM cost tracking per client, conversation, model, and channel +Costing @engineering phase:pilot
x 2026-06-04 (A) 2026-05-17 Add prompt caching strategy notes and request structure with stable prompt content before dynamic customer context +Costing @engineering phase:pilot
x 2026-06-04 (A) 2026-05-17 Add OpenAI data residency configuration notes for Singapore storage constraints and current processing limitations +Compliance @docs phase:pilot
x 2026-06-04 (A) 2026-05-17 Draft standard client contract template with scope of work, SLA, DPA, IP ownership, termination, liability cap, confidentiality, and AI liability +Contracts @legal phase:pilot
x 2026-06-04 (A) 2026-05-17 Draft Data Processing Agreement covering purpose limitation, minimization, retention, consent, subprocessors, breach notification, and deletion +Compliance @legal phase:pilot
x 2026-06-04 (A) 2026-05-17 Appoint Keith as formal Data Protection Officer unless team revises responsibility split +Compliance @legal phase:pilot
x 2026-06-04 (A) 2026-05-17 Prepare PDPC DPO notification and internal DPO record +Compliance @legal phase:pilot
x 2026-06-04 (A) 2026-05-17 Draft written internal Data Protection policy for client customer data +Compliance @legal phase:pilot
x 2026-05-17 (A) 2026-05-17 Draft incident response plan for PDPA breach, hallucination incident, and channel policy breach +Compliance @ops phase:pilot
x 2026-05-17 (A) 2026-05-17 Draft data retention limits for conversation logs, knowledge sources, embeddings, audit logs, and deleted client data +Compliance @legal phase:pilot
x 2026-05-17 (A) 2026-05-17 Add offboarding export for conversation history, knowledge base, brand voice document, and client configuration +Offboarding @engineering phase:pilot
x 2026-05-17 (A) 2026-05-17 Add offboarding deletion workflow with 30-day data return, integration shutdown, deletion confirmation, and audit log +Offboarding @engineering phase:pilot
x 2026-05-17 (A) 2026-05-17 Add encryption-at-rest and encryption-in-transit checklist for local, staging, and production environments +Security @ops phase:pilot
x 2026-06-04 (A) 2026-06-04 Fail closed when AUTH_SECRET is missing or left as the local default in production +Security @engineering phase:pilot
x 2026-06-04 (A) 2026-05-17 Complete remaining audit log coverage for login/logout, failed auth attempts, client notification settings, and offboarding data export; channel update, knowledge ingestion/update/delete, review creation, escalation claim, escalation resolution, and offboarding deletion already log +Security @engineering phase:pilot
x 2026-06-04 (A) 2026-06-04 Add login rate limiting and failed-login backoff or lockout around password auth +Security @engineering phase:pilot
x 2026-05-17 (A) 2026-05-17 Add role-based access tests proving client users cannot access other client data or operator-only routes +Security @quality phase:pilot
x 2026-05-17 (A) 2026-05-17 Add Anthropic provider adapter interface implementation for Claude Sonnet, Haiku routing, and future Opus fallback +ProviderPortability @engineering phase:tighten
x 2026-05-17 (A) 2026-05-17 Add provider selection per client and per task with model defaults, cost labels, and failover behavior +ProviderPortability @engineering phase:tighten
x 2026-06-05 (A) 2026-06-05 Add free/testing LLM provider catalog, OpenAI-compatible adapter, encrypted provider key storage, operator provider controls, and provider test console +ProviderPortability @engineering phase:tighten
x 2026-06-05 (A) 2026-05-17 Add manual provider pricing monitor task for OpenAI, Anthropic, Gemini, and WhatsApp channel pricing with monthly Jira review cadence +Risk @ops phase:tighten
x 2026-06-05 (A) 2026-05-17 Add manual Meta WhatsApp Business policy monitor task and compliance posture notes cadence:monthly +Risk @ops phase:tighten
x 2026-06-10 (A) 2026-06-05 Add scheduler-backed provider pricing diff monitor for OpenAI, Anthropic, Gemini, and WhatsApp channel pricing changes cadence:monthly +Risk @ops phase:tighten
x 2026-06-10 (A) 2026-06-05 Add scheduler-backed Meta WhatsApp Business policy monitor with external alerting cadence:monthly +Risk @ops phase:tighten
x 2026-05-17 (A) 2026-05-17 Document Pronto as purpose-driven business AI and not a general-purpose chatbot in product, contract, and channel setup docs +Compliance @docs phase:pilot
x 2026-06-05 (A) 2026-05-17 Add approved-template-only guardrail for any future proactive WhatsApp notifications +Channels @compliance phase:tighten
(B) 2026-05-17 Add Google Calendar read-only availability integration with no booking mutations in v1 +Integrations @engineering phase:tighten
(B) 2026-05-17 Add Calendly read-only availability integration with no booking mutations in v1 +Integrations @engineering phase:tighten
(B) 2026-05-17 Add Shopify product catalog and order-status read-only integration with refund and modification escalation +Integrations @engineering phase:tighten
(B) 2026-05-17 Add WooCommerce product catalog and order-status read-only integration with refund and modification escalation +Integrations @engineering phase:tighten
(B) 2026-05-17 Add delivery or 3PL tracking read-only integration pattern with no delivery-time promises unless source confirms it +Integrations @engineering phase:tighten
(B) 2026-05-17 Add custom inventory database integration pattern with standardized read-only tools +Integrations @engineering phase:tighten
(B) 2026-05-17 Build integration library covering top 5 most-requested APIs from pilots +Integrations @engineering phase:tighten
(B) 2026-05-17 Add non-LLM integration credential storage plan with secret redaction and per-client rotation process; LLM provider credential storage exists +Security @engineering phase:tighten
(B) 2026-05-17 Add Messenger channel adapter through Meta Graph API +Channels @engineering phase:v2
(B) 2026-05-17 Add Instagram DMs channel adapter through Meta Graph API +Channels @engineering phase:v2
(B) 2026-05-17 Add email channel adapter through Postmark or Resend +Channels @engineering phase:v2
(B) 2026-05-17 Add LINE and Zalo feasibility notes for SEA expansion after Singapore validation +Channels @research phase:scale
x 2026-06-05 (B) 2026-05-17 Build client dashboard analytics for conversation volume, escalation rate, response time, CSAT, and knowledge gaps +Dashboard @engineering phase:tighten
(B) 2026-05-17 Build operator workflow for creating clients, assigning users, and selecting plan tier; channel configuration screen already exists +Dashboard @engineering phase:tighten
x 2026-05-17 (B) 2026-05-17 Build manual override workflow for operators and client owners +Dashboard @engineering phase:tighten
x 2026-06-05 (B) 2026-05-17 Build conversation search and filters by channel, status, escalation reason, date, customer, and review outcome +Dashboard @engineering phase:tighten
(B) 2026-05-17 Add bulk escalation handling for clients with multiple staff +Dashboard @engineering phase:tighten
x 2026-06-05 (B) 2026-05-17 Add knowledge gap report from low-confidence and escalated conversations +Dashboard @quality phase:tighten
(B) 2026-05-17 Add monthly client check-in performance report generator with summary metrics and recommended knowledge updates; knowledge refresh workflow already exists +Ops @dashboard phase:tighten
x 2026-06-05 (B) 2026-05-17 Add tier-specific SLA tracking for Starter 24h business-hours, Growth 4h business-hours, and Scale 1h business-hours +Ops @dashboard phase:tighten
(B) 2026-05-17 Add sales funnel tracking for discovery calls, proposals, trials, launches, conversion rates, and time-to-contract +GTM @business phase:tighten
(B) 2026-05-17 Add trial workflow for 2-4 week scoped paid pilots with fee credited toward setup on conversion +Pricing @business phase:pilot
(B) 2026-05-17 Add pricing plan and add-on catalog records for setup fee, Starter, Growth, Scale, Enterprise, and custom add-ons; per-client commercial assumptions already exist +Pricing @business phase:pilot
(B) 2026-05-17 Confirm SGD versus USD billing and document the decision +Pricing @business phase:pilot
(B) 2026-05-17 Confirm annual prepay discount, recommended as 2 months free +Pricing @business phase:pilot
(B) 2026-05-17 Confirm referral incentive, recommended as 1 month free for referrer when new client signs +Pricing @business phase:pilot
(B) 2026-05-17 Add add-on pricing placeholders for new channels, integrations, analytics dashboards, custom reports, and multilingual upgrades +Pricing @business phase:tighten
(B) 2026-05-17 Create 20-30 minute discovery call checklist for CS pain, channel mix, query volume, data sources, scope, and escalation boundaries +GTM @sales phase:pilot
(B) 2026-05-17 Create proposal template covering scope, channels, data sources, pricing, timeline, pilot criteria, and launch path +GTM @sales phase:pilot
(B) 2026-05-17 Create deep discovery checklist for brand voice, static sources, live sources, integrations, and escalation rules +GTM @sales phase:pilot
(B) 2026-05-17 Create first 3-5 client outreach list from founder network across F&B, e-commerce, Carousell, and Shopee contacts +GTM @sales phase:validate
(B) 2026-05-17 Define pilot discount terms in exchange for case studies, testimonials, and right to use brand in marketing +GTM @sales phase:validate
(B) 2026-05-17 Draft case study template with before baseline, response time, conversion impact, escalation rate, and client quote +GTM @marketing phase:validate
(B) 2026-05-17 Create referral partner list for web designers, branding agencies, and Singapore SME marketing consultants +GTM @partnerships phase:tighten
(B) 2026-05-17 Draft targeted LinkedIn outreach sequence for Singapore SME owners in F&B and e-commerce +GTM @sales phase:tighten
(B) 2026-05-17 Research PSG Grant pre-approval requirements, vendor criteria, timeline, and documentation package +GTM @research phase:tighten
(B) 2026-05-17 Prepare PSG Grant pre-approval application plan if Pronto qualifies +GTM @business phase:tighten
(B) 2026-05-17 Define SEO landing page keywords for AI customer service Singapore and vertical-specific variants +GTM @marketing phase:scale
(B) 2026-05-17 Evaluate paid search only after unit economics and conversion rates support CAC payback +GTM @marketing phase:scale
(B) 2026-05-17 Identify Singapore SME events for talks, demos, or founder-led content +GTM @marketing phase:scale
(B) 2026-05-17 Add business health dashboard for active clients, MRR, new ARR, gross margin, churn, NRR, and monthly gross profit +Metrics @business phase:tighten
(B) 2026-05-17 Add north-star monthly gross profit dashboard and monthly review habit +Metrics @business phase:tighten
(B) 2026-05-17 Add client concentration warning when any client exceeds 30 percent of MRR +Risk @business phase:tighten
(B) 2026-05-17 Add capacity planning dashboard for active clients, active builds, maintenance load, and Gabriel engineering hours +Ops @business phase:tighten
x 2026-05-17 (B) 2026-05-17 Document hard client cap of 8-12 concurrent active clients for current team +Ops @business phase:pilot
x 2026-05-17 (B) 2026-05-17 Add hiring trigger note for junior dev or contract engineer at 6+ active clients +Hiring @business phase:tighten
x 2026-05-17 (B) 2026-05-17 Add hiring trigger note for customer success or ops contractor at 10+ active clients +Hiring @business phase:tighten
x 2026-05-17 (B) 2026-05-17 Add policy that team should not hire ahead of revenue +Hiring @business phase:tighten
x 2026-05-17 (B) 2026-05-17 Document decision rights for Keith, Gabriel, and Astin across scope, legal, pricing, tech, and hiring +Ops @docs phase:pilot
x 2026-05-17 (B) 2026-05-17 Document Gabriel technical veto on infeasible per-client scope +Ops @docs phase:pilot
x 2026-05-17 (B) 2026-05-17 Create technical architecture runbook for templated core, RAG, guardrails, channels, integrations, escalation, and dashboard +Docs @engineering phase:pilot
x 2026-06-10 (B) 2026-05-17 Create onboarding guide so a second engineer can become productive on templated core in under 2 weeks +Docs @engineering phase:tighten
x 2026-06-10 (B) 2026-05-17 Create integration playbook for scoping, credential collection, API limits, read-only tools, error handling, and client signoff +Docs @engineering phase:tighten
x 2026-05-17 (B) 2026-05-17 Create incident post-mortem template for hallucination, data breach, channel outage, and integration failure +Docs @ops phase:pilot
x 2026-06-05 (B) 2026-05-17 Extend structured logging and request IDs from webhooks into agent runs, retrieval, provider calls, and background outbound sends +Observability @engineering phase:pilot
x 2026-06-05 (B) 2026-06-04 Add background outbound outbox retry worker for failed or stale sending messages beyond the immediate in-route local-release flush +Channels @engineering phase:tighten
x 2026-06-05 (B) 2026-06-05 Add local operational alert scaffolding for failed outbound sends, degraded channels, overdue knowledge refreshes, and quality blockers +Observability @dashboard phase:tighten
x 2026-06-10 (B) 2026-05-17 Add persistent error tracking and external alert routing for webhook failures, LLM failures, database errors, and outbound send failures; local operational alert scaffolding already exists +Observability @engineering phase:tighten
(B) 2026-05-17 Add LangSmith or custom trace view for conversation review and model debugging +Observability @engineering phase:tighten
(B) 2026-05-17 Add per-client cost alert when estimated monthly variable cost exceeds tier margin assumptions +Costing @business phase:tighten
(B) 2026-05-17 Add load and cost model for standard SME 500 conversations, Growth 2000 conversations, Scale 6000 conversations, and heavy 3000+ conversations +Costing @business phase:tighten
(B) 2026-05-17 Add hosting cost tracker for shared compute, vector storage, logs, and agent state per client +Costing @business phase:tighten
(B) 2026-05-17 Add integration overhead tracker for paid APIs, free tier limits, and custom maintenance burden +Costing @business phase:tighten
(C) 2026-05-17 Revisit Pinecone or Weaviate only if pgvector scale, latency, or ops burden demands it +Roadmap @engineering phase:scale
(C) 2026-05-17 Evaluate fine-tuning only for high-volume clients where voice consistency is mission-critical +Roadmap @engineering phase:scale
(C) 2026-05-17 Evaluate self-serve lower tier only after 15-30 paying clients and no cannibalization risk +Roadmap @business phase:scale
(C) 2026-05-17 Add Malaysia expansion research after Singapore repeatable wins +Roadmap @business phase:scale
(C) 2026-05-17 Add SEA rollout roadmap with channel differences for Malaysia, Indonesia, Thailand, and Vietnam +Roadmap @business phase:expand
(C) 2026-05-17 Research professional indemnity insurance once revenue supports the premium +Risk @legal phase:tighten
(C) 2026-05-17 Maintain competitor watch list for SleekFlow, Wati, Respond.io, Trengo, Omnichat, Manychat, AI Super, Elevatespot, aichatbot.sg, Kaizenaire, CommzGate, Intercom, and Zendesk AI cadence:quarterly +Risk @business
(C) 2026-05-17 Build public proof points from Phase 1 case studies before structured outbound and paid marketing +GTM @marketing phase:tighten
(C) 2026-05-17 Define Phase 1 go/no-go criteria for unit economics, delivery time, pilot conversion, and failure mode resolution +Roadmap @business phase:validate
(C) 2026-05-17 Define Phase 2 go/no-go criteria for standard pricing, 5-10 clients, PSG progress, clinic expansion, and integration library +Roadmap @business phase:tighten
(C) 2026-05-17 Define Phase 3 go/no-go criteria for 15-30 clients, self-serve evaluation, Malaysia exploration, and team capacity +Roadmap @business phase:scale
