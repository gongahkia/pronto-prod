-- Tranche C. Submissions are separate from active RAG sources until reviewed and published.
create table knowledge_source_submissions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  target_source_id uuid not null,
  source_type text not null check (source_type in ('text','pdf','url')),
  action text not null default 'upsert' check (action in ('upsert','archive')),
  status text not null default 'pending' check (status in
    ('pending','revision_requested','rejected','approved','staged','published')),
  current_revision integer not null default 1 check (current_revision > 0),
  submitted_by uuid not null references users(id),
  reviewed_by uuid references users(id),
  reviewed_revision integer,
  reviewed_at timestamptz,
  review_note text,
  staged_edit_version integer,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id,id)
);
create index knowledge_source_submissions_queue_idx on knowledge_source_submissions(client_id,status,updated_at desc);
create table knowledge_source_submission_revisions (
  submission_id uuid not null,
  client_id uuid not null,
  revision integer not null check (revision > 0),
  title text not null,
  description text not null default '',
  outlet_name text,
  content text not null,
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  source_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  primary key (submission_id,revision),
  foreign key (client_id,submission_id) references knowledge_source_submissions(client_id,id) on delete cascade
);

-- Existing notification jobs remain the authority for initial delivery. Timed jobs share
-- their claim/retry/uncertain lifecycle and are never addressed to customer channels.
alter table staff_notification_jobs drop constraint staff_notification_jobs_escalation_id_key;
alter table staff_notification_jobs add column kind text not null default 'initial'
  check (kind in ('initial','reminder','backup'));
alter table staff_notification_jobs add column policy_version integer;
alter table staff_notification_jobs add column schedule_key text;
create unique index staff_notification_jobs_escalation_schedule_idx
  on staff_notification_jobs(escalation_id,kind,schedule_key);
create index staff_notification_jobs_due_idx on staff_notification_jobs(status,available_at)
  where kind <> 'initial';

create table knowledge_review_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  message_id uuid not null references messages(id) on delete cascade,
  escalation_id uuid references escalations(id) on delete set null,
  reason_code text not null,
  question text not null,
  source_references jsonb not null default '[]'::jsonb,
  status text not null default 'open' check (status in ('open','suggested','resolved','dismissed')),
  suggestion_id uuid references knowledge_suggestions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id,message_id)
);
create index knowledge_review_items_queue_idx on knowledge_review_items(client_id,status,created_at desc);
