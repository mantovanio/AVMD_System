create table if not exists faixas_comissao (
  id uuid primary key default gen_random_uuid(),
  faixa text not null,
  min_emissoes integer not null default 1,
  max_emissoes integer,
  percentual numeric(8,4) not null default 0,
  valor_exemplo numeric(12,2),
  ordem integer not null default 1,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_faixas_comissao_ordem on faixas_comissao (ordem asc);

create table if not exists tabelas_preco_participantes (
  id uuid primary key default gen_random_uuid(),
  tabela_preco_id uuid not null references tabelas_preco(id) on delete cascade,
  tipo_participante text not null,
  parceiro_id uuid,
  tipo_parceiro text,
  perfil text,
  created_at timestamptz not null default now()
);

create index if not exists idx_tpp_tabela on tabelas_preco_participantes (tabela_preco_id);
