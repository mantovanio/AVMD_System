create table if not exists perfil_modelos_negocio (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  ponto_atendimento_id uuid references pontos_atendimento(id) on delete cascade,
  modo_operacao text not null default 'comissao' check (modo_operacao in ('comissao', 'revenda')),
  ativo boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_perfil_modelos_negocio_profile_ponto
  on perfil_modelos_negocio (profile_id, ponto_atendimento_id);

create table if not exists perfil_precos_base_revenda (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  ponto_atendimento_id uuid not null references pontos_atendimento(id) on delete cascade,
  tabela_preco_item_id uuid not null references tabelas_preco_itens(id) on delete cascade,
  valor_base numeric(12,2) not null default 0,
  ativo boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_perfil_precos_base_revenda_item
  on perfil_precos_base_revenda (profile_id, ponto_atendimento_id, tabela_preco_item_id);

create table if not exists perfil_repasse_regras (
  id uuid primary key default gen_random_uuid(),
  parent_profile_id uuid not null references profiles(id) on delete cascade,
  child_profile_id uuid not null references profiles(id) on delete cascade,
  ponto_atendimento_id uuid not null references pontos_atendimento(id) on delete cascade,
  escopo text not null check (escopo in ('validacao', 'venda', 'margem_revenda')),
  tipo_calculo text not null check (tipo_calculo in ('fixa', 'percentual')),
  valor numeric(12,2) not null default 0,
  ativo boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_perfil_repasse_regras_parent_child_escopo
  on perfil_repasse_regras (parent_profile_id, child_profile_id, ponto_atendimento_id, escopo);

create index if not exists idx_perfil_repasse_regras_child_ponto
  on perfil_repasse_regras (child_profile_id, ponto_atendimento_id, ativo);
