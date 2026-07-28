create table if not exists vendedor_agente_acesso (
  id uuid primary key default gen_random_uuid(),
  vendedor_id uuid not null references profiles(id) on delete cascade,
  agente_id uuid references profiles(id) on delete cascade,
  ativo boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendedor_id)
);

create index if not exists idx_vendedor_agente_acesso_vendedor
  on vendedor_agente_acesso (vendedor_id, ativo);

create index if not exists idx_vendedor_agente_acesso_agente
  on vendedor_agente_acesso (agente_id, ativo);
