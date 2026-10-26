create table demo_processing_status (
 client_id uuid primary key references clients(id) on delete cascade,
 last_started_at timestamptz,
 last_completed_at timestamptz,
 last_failed_at timestamptz
);
