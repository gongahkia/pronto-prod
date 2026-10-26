create table if not exists demo_feedback_threads (
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references clients(id) on delete cascade,
 page_path text not null,
 anchor jsonb not null,
 status text not null default 'open' check(status in ('open','resolved')),
 created_by_user_id uuid references users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists demo_feedback_page_idx on demo_feedback_threads(client_id,page_path,updated_at desc);
create table if not exists demo_feedback_comments (
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references clients(id) on delete cascade,
 thread_id uuid not null references demo_feedback_threads(id) on delete cascade,
 author_user_id uuid references users(id) on delete set null,
 author_name text not null,
 body text not null check(char_length(body) between 1 and 3000),
 created_at timestamptz not null default now()
);
create index if not exists demo_feedback_comments_thread_idx on demo_feedback_comments(client_id,thread_id,created_at);
