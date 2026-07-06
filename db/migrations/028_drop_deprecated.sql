-- Migration 028: Drop deprecated tables after scope cut.
-- Safe drops for tables no longer referenced by application code.

BEGIN;

-- Console channel rows are no longer part of the product scope.
DELETE FROM channels WHERE kind = 'console';

-- Assistant/copilot (migration 014)
DROP TABLE IF EXISTS assistant_action_proposals CASCADE;
DROP TABLE IF EXISTS assistant_messages CASCADE;
DROP TABLE IF EXISTS assistant_threads CASCADE;

-- Reviews / QA labels (migration 003)
DROP TABLE IF EXISTS reviews CASCADE;

-- Risk monitoring (migration 017)
DROP TABLE IF EXISTS risk_monitor_findings CASCADE;
DROP TABLE IF EXISTS risk_monitor_snapshots CASCADE;
DROP TABLE IF EXISTS risk_monitor_sources CASCADE;

-- Client launch milestones + commercial assumptions (from migration 009 readiness bundle)
DROP TABLE IF EXISTS client_launch_milestones CASCADE;
DROP TABLE IF EXISTS client_commercial_assumptions CASCADE;

-- LLM provider credentials (migration 011)
DROP TABLE IF EXISTS llm_provider_credentials CASCADE;

-- Rate limit buckets (migration 016)
DROP TABLE IF EXISTS rate_limit_buckets CASCADE;

-- Webhook replay events (from migration 007 or 024, verify column existence first)
DROP TABLE IF EXISTS webhook_replay_events CASCADE;

-- Email suppressions - KEEP: still needed for bounce handling (Postmark/Resend)
-- (this line intentionally left as a comment for reviewer clarity)

-- Note: Do NOT drop:
--   clients, users, channels, conversations, messages, escalations,
--   knowledge_sources, knowledge_chunks, knowledge_source_versions,
--   knowledge_refresh_requests, agent_configs, agent_config_changes,
--   agent_traces, brand_voice_documents, brand_voice_examples,
--   csat_responses, integration_credentials, outbound_messages,
--   error_events, audit_logs, metric_events, email_suppressions,
--   client_assistant_change_requests, triage_flows

COMMIT;
