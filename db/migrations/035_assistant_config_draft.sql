-- Keep customer-facing prompt and agent rules in the existing reviewed assistant draft.
alter table assistant_drafts add column if not exists config jsonb;
