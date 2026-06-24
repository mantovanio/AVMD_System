create table if not exists bancos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  nome text not null,
  ispb text,
  ativo boolean not null default true,
  origem text not null default 'manual',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_bancos_codigo on bancos (codigo);

create table if not exists centros_custos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  codigo text,
  ativo boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists parceiros (
  id uuid primary key default gen_random_uuid(),
  codigo_parceiro text,
  cpf_cnpj text,
  nome text not null,
  razao_social text,
  nome_fantasia text,
  responsavel text,
  id_local_atendimento text,
  senha_acesso text,
  email_acesso text,
  ddd text,
  telefone text,
  email text,
  email_adicional_1 text,
  email_adicional_2 text,
  email_adicional_3 text,
  cep text,
  logradouro text,
  numero text,
  ibge text,
  complemento text,
  bairro text,
  cidade text,
  estado text,
  observacao text,
  token text,
  inscricao_municipal text,
  inscricao_estadual text,
  tipo_parceiro text,
  data_ativacao date,
  data_desativacao date,
  bloquear_vendas_protocolos boolean not null default false,
  nao_enviar_whatsapp_vendas boolean not null default false,
  nao_enviar_email_vendas boolean not null default false,
  nao_enviar_renovacao_clientes boolean not null default false,
  nao_quero_receber_whatsapp boolean not null default false,
  nao_quero_receber_email boolean not null default false,
  gestor_1_id uuid references profiles(id) on delete set null,
  gestor_2_id uuid references profiles(id) on delete set null,
  gestor_3_id uuid references profiles(id) on delete set null,
  gestor_4_id uuid references profiles(id) on delete set null,
  gestor_5_id uuid references profiles(id) on delete set null,
  tipo_conta text,
  banco_id uuid references bancos(id) on delete set null,
  agencia text,
  agencia_digito text,
  conta text,
  conta_digito text,
  operacao text,
  cnpj_cpf_titular text,
  titular_conta text,
  chave_pix text,
  centro_custo_id uuid references centros_custos(id) on delete set null,
  segmento text not null default 'baixo',
  status text not null default 'ativo',
  emissoes_mes integer not null default 0,
  receita_mes numeric(12,2) not null default 0,
  desde date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_parceiros_status on parceiros (status, created_at desc);
create index if not exists idx_parceiros_cpf_cnpj on parceiros (cpf_cnpj) where cpf_cnpj is not null;

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_name = 'parceiros_agentes_permitidos'
      and constraint_name = 'parceiros_agentes_permitidos_parceiro_id_fkey'
  ) then
    alter table parceiros_agentes_permitidos
      add constraint parceiros_agentes_permitidos_parceiro_id_fkey
      foreign key (parceiro_id) references parceiros(id) on delete cascade;
  end if;
end$$;
