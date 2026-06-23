create table if not exists schedule_email_events (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'unknown',
  mailbox text,
  external_id text,
  message_id text,
  event_type text not null default 'unknown',
  status text not null default 'received',
  matched_agendamento_id uuid references agendamentos_validacao(id) on delete set null,
  matched_venda_id uuid references vendas_certificados(id) on delete set null,
  customer_name text,
  customer_email text,
  customer_phone text,
  customer_document text,
  protocolo_numero text,
  pedido_numero text,
  data_agendada timestamptz,
  payload jsonb not null default '{}'::jsonb,
  processing_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_schedule_email_events_external_id
  on schedule_email_events (external_id)
  where external_id is not null;

create unique index if not exists ux_schedule_email_events_message_id
  on schedule_email_events (message_id)
  where message_id is not null;

create index if not exists idx_schedule_email_events_status
  on schedule_email_events (status, created_at desc);

create index if not exists idx_schedule_email_events_match
  on schedule_email_events (matched_venda_id, matched_agendamento_id, created_at desc);
