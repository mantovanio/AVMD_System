create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  nome text,
  perfil text not null default 'usuario',
  status text not null default 'ativo',
  tipo_vinculo text,
  parceiro_id uuid,
  documento text,
  telefone text,
  cidade text,
  permissoes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table if not exists certificados (
  id uuid primary key default gen_random_uuid(),
  codigo integer,
  tipo text not null,
  estoque integer not null default 0,
  validade text,
  descricao text,
  modelo text,
  categoria text,
  tipo_emissao_padrao text,
  periodo_uso text,
  descricao_produto text,
  produto_vinculado_ac text,
  preco_venda numeric(12,2) not null default 0,
  valor_custo_ac numeric(12,2) not null default 0,
  valor_custo numeric(12,2) not null default 0,
  agrupador text,
  hash text,
  ativo boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists formas_pagamento_v2 (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  codigo text,
  tipo text,
  gateway text,
  ativo boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pontos_atendimento (
  id uuid primary key default gen_random_uuid(),
  codigo text,
  nome text not null,
  endereco text,
  cidade text,
  uf text,
  status text not null default 'ativo',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tabelas_preco (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  codigo_voucher text,
  max_desconto_percentual numeric(8,2) not null default 0,
  max_desconto_valor numeric(12,2) not null default 0,
  comissao_venda_pct numeric(8,2) not null default 0,
  comissao_gestor_pct numeric(8,2) not null default 0,
  comissao_gestor_valor numeric(12,2) not null default 0,
  ativo boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tabelas_preco_itens (
  id uuid primary key default gen_random_uuid(),
  tabela_preco_id uuid not null references tabelas_preco(id) on delete cascade,
  certificado_id uuid not null references certificados(id) on delete restrict,
  valor numeric(12,2) not null default 0,
  valor_custo numeric(12,2) not null default 0,
  valor_repasse numeric(12,2) not null default 0,
  link_safeweb text,
  ativo boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tabela_preco_id, certificado_id)
);

create table if not exists lojas_marketplace (
  id uuid primary key default gen_random_uuid(),
  nome_loja text not null,
  slug text not null unique,
  tabela_preco_id uuid not null references tabelas_preco(id) on delete restrict,
  owner_tipo text not null default 'institucional',
  owner_profile_id uuid references profiles(id) on delete set null,
  owner_parceiro_id uuid,
  descricao text,
  dominio_publico text,
  ativo boolean not null default true,
  configuracoes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agentes_tabelas_preco (
  id uuid primary key default gen_random_uuid(),
  tabela_preco_id uuid not null references tabelas_preco(id) on delete cascade,
  agente_registro_id uuid not null references profiles(id) on delete cascade,
  ponto_atendimento_id uuid references pontos_atendimento(id) on delete set null,
  ativo boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists parceiros_agentes_permitidos (
  id uuid primary key default gen_random_uuid(),
  parceiro_id uuid not null,
  agente_registro_id uuid not null references profiles(id) on delete cascade,
  ponto_atendimento_id uuid references pontos_atendimento(id) on delete set null,
  ativo boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agentes_disponibilidade (
  id uuid primary key default gen_random_uuid(),
  agente_registro_id uuid not null references profiles(id) on delete cascade,
  ponto_atendimento_id uuid not null references pontos_atendimento(id) on delete cascade,
  dia_semana integer not null check (dia_semana between 0 and 6),
  hora_inicio time not null,
  hora_fim time not null,
  intervalo_minutos integer not null default 30,
  capacidade_por_slot integer not null default 1,
  tipo_atendimento text,
  ativo boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agentes_indisponibilidades (
  id uuid primary key default gen_random_uuid(),
  agente_registro_id uuid not null references profiles(id) on delete cascade,
  ponto_atendimento_id uuid references pontos_atendimento(id) on delete set null,
  inicio_em timestamptz not null,
  fim_em timestamptz not null,
  motivo text,
  ativo boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists cadastros_base (
  id uuid primary key default gen_random_uuid(),
  tipo_cliente text not null default 'pessoa_fisica',
  tipo_cadastro text not null default 'cliente',
  cpf_cnpj text not null,
  nome text not null,
  nome_fantasia text,
  email text,
  telefone text,
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  uf text,
  cep text,
  inscricao_municipal text,
  inscricao_estadual text,
  iss_retido boolean not null default false,
  status text not null default 'ativo',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cadastros_base_cpf_cnpj on cadastros_base (cpf_cnpj);

create table if not exists titulares_certificado (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cpf text not null,
  data_nascimento date,
  email text,
  telefone text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_titulares_certificado_cpf on titulares_certificado (cpf);

create table if not exists vendas_certificados (
  id uuid primary key default gen_random_uuid(),
  loja_marketplace_id uuid references lojas_marketplace(id) on delete set null,
  cadastro_base_id uuid not null references cadastros_base(id) on delete restrict,
  empresa_id uuid,
  titular_id uuid references titulares_certificado(id) on delete set null,
  certificado_id uuid references certificados(id) on delete set null,
  tabela_preco_id uuid references tabelas_preco(id) on delete set null,
  tabela_preco_item_id uuid references tabelas_preco_itens(id) on delete set null,
  forma_pagamento_id uuid references formas_pagamento_v2(id) on delete set null,
  pago boolean not null default false,
  data_pagamento timestamptz,
  data_vencimento date,
  tipo_produto text,
  tipo_venda text,
  tipo_emissao text,
  tabela_preco text,
  valor_venda numeric(12,2),
  valor_custo numeric(12,2),
  documento_faturamento text,
  nome_faturamento text,
  email_faturamento text,
  telefone_faturamento text,
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  uf text,
  cep text,
  inscricao_municipal text,
  inscricao_estadual text,
  iss_retido boolean not null default false,
  vendedor_id uuid references profiles(id) on delete set null,
  agente_registro_id uuid references profiles(id) on delete set null,
  contador_id uuid,
  ponto_atendimento_id uuid references pontos_atendimento(id) on delete set null,
  pedido_numero text,
  pedido_status text not null default 'nao_gerado',
  protocolo_numero text,
  protocolo_status text not null default 'nao_gerado',
  certificadora text,
  numero_serie text,
  data_inicio_validade date,
  voucher_codigo text,
  voucher_percentual numeric(8,2),
  voucher_valor numeric(12,2),
  nome_ar text,
  nome_local_atendimento text,
  status_certificado text,
  nome_parceiro_safeweb text,
  validado_safeweb boolean,
  api_payload_pedido jsonb not null default '{}'::jsonb,
  api_payload_protocolo jsonb not null default '{}'::jsonb,
  comissao_vendedor_tipo text,
  comissao_vendedor_valor numeric(12,2),
  comissao_agente_tipo text,
  comissao_agente_valor numeric(12,2),
  status_venda text not null default 'rascunho',
  observacoes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vendas_certificados_cadastro on vendas_certificados (cadastro_base_id, created_at desc);
create index if not exists idx_vendas_certificados_protocolo on vendas_certificados (protocolo_numero);

create table if not exists agendamentos_validacao (
  id uuid primary key default gen_random_uuid(),
  venda_certificado_id uuid not null references vendas_certificados(id) on delete cascade,
  cadastro_base_id uuid not null references cadastros_base(id) on delete restrict,
  empresa_id uuid,
  titular_id uuid references titulares_certificado(id) on delete set null,
  contador_id uuid,
  agente_registro_id uuid references profiles(id) on delete set null,
  ponto_atendimento_id uuid references pontos_atendimento(id) on delete set null,
  data_agendada timestamptz,
  tipo_atendimento text,
  status_agendamento text not null default 'pendente',
  observacoes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_agendamentos_validacao_data on agendamentos_validacao (data_agendada);
create index if not exists idx_agendamentos_validacao_agente on agendamentos_validacao (agente_registro_id, data_agendada);
