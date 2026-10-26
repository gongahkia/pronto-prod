-- The private preview and its tested marker have been retired.
-- Exact-revision business approval remains the publication gate.
alter table assistant_drafts drop column if exists tested_at;
