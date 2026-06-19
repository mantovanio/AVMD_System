create table if not exists integration_events (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  provider text not null,
  direction text not null,
  event_type text not null,
  status text not null default 'queued',
  entity_type text,
  entity_id text,
  correlation_id text,
  external_id text,
  payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  error_message text,
  received_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_integration_events_status on integration_events (status, created_at);
create index if not exists idx_integration_events_provider on integration_events (provider, event_type, created_at desc);
create index if not exists idx_integration_events_entity on integration_events (entity_type, entity_id, created_at desc);
create index if not exists idx_integration_events_correlation on integration_events (correlation_id);
