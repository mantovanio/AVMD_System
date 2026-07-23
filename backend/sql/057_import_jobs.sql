create table if not exists import_jobs (
  id uuid primary key,
  tipo text not null default 'safeweb_financeiro',
  status text not null default 'queued',
  total_files integer not null default 0,
  total_rows integer not null default 0,
  progress_current integer not null default 0,
  progress_total integer not null default 0,
  message text,
  result jsonb not null default '{}'::jsonb,
  error text,
  created_by text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists import_job_files (
  id uuid primary key,
  job_id uuid not null references import_jobs(id) on delete cascade,
  file_name text not null,
  file_type text,
  rows_count integer not null default 0,
  rows_json jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  result jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists import_jobs_status_created_at_idx
  on import_jobs (status, created_at desc);

create index if not exists import_job_files_job_id_idx
  on import_job_files (job_id);
