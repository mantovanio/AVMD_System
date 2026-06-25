create table if not exists pontos_atendimento_agentes (
  id uuid primary key default gen_random_uuid(),
  ponto_atendimento_id uuid not null references pontos_atendimento(id) on delete cascade,
  agente_id uuid not null references profiles(id) on delete cascade,
  principal boolean not null default false,
  ativo boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_pontos_atendimento_agentes_ponto_agente
  on pontos_atendimento_agentes (ponto_atendimento_id, agente_id);

create index if not exists idx_pontos_atendimento_agentes_agente
  on pontos_atendimento_agentes (agente_id, ativo);

insert into pontos_atendimento_agentes (
  id,
  ponto_atendimento_id,
  agente_id,
  principal,
  ativo,
  metadata,
  created_at,
  updated_at
)
select
  gen_random_uuid(),
  p.ponto_atendimento_id,
  p.id,
  true,
  true,
  jsonb_build_object('origem', 'profiles_legacy'),
  now(),
  now()
from profiles p
where p.perfil = 'agente_registro'
  and p.ponto_atendimento_id is not null
  and not exists (
    select 1
    from pontos_atendimento_agentes v
    where v.ponto_atendimento_id = p.ponto_atendimento_id
      and v.agente_id = p.id
  );
