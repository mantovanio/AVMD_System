create table if not exists precificacao_simulacoes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  nome text,
  regime_operacional text not null default 'REVENDA' check (regime_operacional in ('REVENDA', 'COMISSIONADO')),
  preco_venda numeric(12,2) not null default 0,
  metodo_pagamento text not null default 'PIX' check (metodo_pagamento in ('PIX', 'CARTAO_AVISTA', 'CARTAO_PARCELADO', 'BOLETO')),
  saldo_final numeric(12,2) not null default 0,
  margem_final numeric(12,4) not null default 0,
  detalhe jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_precificacao_simulacoes_profile_created
  on precificacao_simulacoes (profile_id, created_at desc);
