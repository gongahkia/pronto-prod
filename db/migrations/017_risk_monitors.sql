create table if not exists risk_monitor_sources (
  id text primary key,
  kind text not null check (kind in ('pricing', 'policy')),
  label text not null,
  url text not null,
  cadence_days integer not null default 30,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists risk_monitor_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references risk_monitor_sources(id) on delete cascade,
  fetched_at timestamptz not null default now(),
  status_code integer,
  content_hash text,
  content_length integer not null default 0,
  excerpt text,
  fetch_error text
);

create index if not exists risk_monitor_snapshots_source_idx
  on risk_monitor_snapshots (source_id, fetched_at desc);

create table if not exists risk_monitor_findings (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references risk_monitor_sources(id) on delete cascade,
  finding_kind text not null check (finding_kind in ('changed', 'unreachable', 'overdue')),
  detected_at timestamptz not null default now(),
  previous_snapshot_id uuid references risk_monitor_snapshots(id) on delete set null,
  current_snapshot_id uuid references risk_monitor_snapshots(id) on delete set null,
  summary text not null,
  acknowledged_at timestamptz,
  acknowledged_by uuid references users(id) on delete set null
);

create index if not exists risk_monitor_findings_source_idx
  on risk_monitor_findings (source_id, detected_at desc);

create index if not exists risk_monitor_findings_open_idx
  on risk_monitor_findings (detected_at desc)
  where acknowledged_at is null;

insert into risk_monitor_sources (id, kind, label, url, cadence_days)
values
  ('openai_pricing', 'pricing', 'OpenAI API pricing', 'https://openai.com/api/pricing/', 30),
  ('anthropic_pricing', 'pricing', 'Anthropic pricing', 'https://docs.anthropic.com/en/docs/about-claude/pricing', 30),
  ('gemini_pricing', 'pricing', 'Google Gemini API pricing', 'https://ai.google.dev/gemini-api/docs/pricing', 30),
  ('whatsapp_pricing', 'pricing', 'WhatsApp Business Platform pricing', 'https://whatsappbusiness.com/products/platform-pricing/', 30),
  ('whatsapp_business_terms', 'policy', 'WhatsApp Business Terms', 'https://www.whatsapp.com/legal/business-terms', 30),
  ('whatsapp_messaging_policy', 'policy', 'WhatsApp Business Messaging Policy', 'https://www.whatsapp.com/legal/business-policy', 30)
on conflict (id) do nothing;
