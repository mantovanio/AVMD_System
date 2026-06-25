create table if not exists agente_remuneracao_regras (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  ponto_atendimento_id uuid references pontos_atendimento(id) on delete cascade,
  escopo text not null check (escopo in ('validacao', 'venda')),
  tipo_calculo text not null check (tipo_calculo in ('fixa', 'percentual')),
  documento_tipo text not null default 'geral' check (documento_tipo in ('geral', 'cpf', 'cnpj')),
  valor numeric(12,2) not null default 0,
  ativo boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_agente_remuneracao_profile_ponto
  on agente_remuneracao_regras (profile_id, ponto_atendimento_id, escopo, ativo);
