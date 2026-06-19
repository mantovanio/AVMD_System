-- Base inicial do AVMD_System para o projeto Supabase admavmd
-- Aplicar no SQL Editor do Supabase ou em uma migration controlada.

create extension if not exists "pgcrypto";

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, nome, perfil, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'nome', split_part(coalesce(new.email, ''), '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'perfil', 'admin'),
    'ativo'
  )
  on conflict (id) do update
    set email = excluded.email;

  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  nome text,
  perfil text not null default 'usuario',
  status text not null default 'ativo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.modules_config (
  module_name text primary key,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.live_chat (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.leads_contabilidade (
  id uuid primary key default gen_random_uuid(),
  nome_lead text,
  whatsapp_lead text,
  motivo_contato text,
  resumo_conversa text,
  status text default 'iniciou_conversa',
  ultima_mensagem text,
  inicio_atendimento timestamptz,
  data_agendamento timestamptz,
  agendamento_criado_em timestamptz,
  anotacoes text,
  responsavel_profile_id uuid references public.profiles(id) on delete set null,
  responsavel_nome text,
  transferido_em timestamptz,
  transferido_por text,
  follow_up_1 text,
  follow_up_2 text,
  follow_up_3 text,
  horario_comercial boolean default false,
  evolution_remote_jid text,
  evolution_instance text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_leads_contabilidade_whatsapp on public.leads_contabilidade (whatsapp_lead);
create index if not exists idx_leads_contabilidade_responsavel on public.leads_contabilidade (responsavel_profile_id);

create table if not exists public.communication_events (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  event_type text,
  external_id text,
  conversation_id text,
  lead_id uuid references public.leads_contabilidade(id) on delete set null,
  contact text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_communication_events_conversation on public.communication_events (conversation_id, created_at);
create index if not exists idx_communication_events_lead on public.communication_events (lead_id, created_at);

create table if not exists public.chat_lead_documentos (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads_contabilidade(id) on delete cascade,
  nome_original text not null,
  mime_type text,
  tamanho_bytes bigint,
  uploaded_at timestamptz not null default now(),
  uploaded_by text,
  data_url text,
  storage_provider text,
  bucket text,
  storage_path text,
  external_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_lead_documentos_lead on public.chat_lead_documentos (lead_id, created_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'on_auth_user_created_profile'
  ) then
    create trigger on_auth_user_created_profile
      after insert on auth.users
      for each row execute procedure public.handle_new_user_profile();
  end if;
end $$;

insert into storage.buckets (id, name, public)
values ('chat-lead-documentos', 'chat-lead-documentos', false)
on conflict (id) do nothing;

alter table public.profiles enable row level security;
alter table public.modules_config enable row level security;
alter table public.live_chat enable row level security;
alter table public.leads_contabilidade enable row level security;
alter table public.communication_events enable row level security;
alter table public.chat_lead_documentos enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_select_authenticated') then
    create policy profiles_select_authenticated on public.profiles for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_update_own') then
    create policy profiles_update_own on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'modules_config' and policyname = 'modules_config_all_authenticated') then
    create policy modules_config_all_authenticated on public.modules_config for all to authenticated using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'live_chat' and policyname = 'live_chat_all_authenticated') then
    create policy live_chat_all_authenticated on public.live_chat for all to authenticated using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'leads_contabilidade' and policyname = 'leads_all_authenticated') then
    create policy leads_all_authenticated on public.leads_contabilidade for all to authenticated using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'communication_events' and policyname = 'communication_events_all_authenticated') then
    create policy communication_events_all_authenticated on public.communication_events for all to authenticated using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'chat_lead_documentos' and policyname = 'chat_lead_documentos_all_authenticated') then
    create policy chat_lead_documentos_all_authenticated on public.chat_lead_documentos for all to authenticated using (true) with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'storage_chat_docs_authenticated_read'
  ) then
    create policy storage_chat_docs_authenticated_read
      on storage.objects for select
      to authenticated
      using (bucket_id = 'chat-lead-documentos');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'storage_chat_docs_authenticated_insert'
  ) then
    create policy storage_chat_docs_authenticated_insert
      on storage.objects for insert
      to authenticated
      with check (bucket_id = 'chat-lead-documentos');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'storage_chat_docs_authenticated_update'
  ) then
    create policy storage_chat_docs_authenticated_update
      on storage.objects for update
      to authenticated
      using (bucket_id = 'chat-lead-documentos')
      with check (bucket_id = 'chat-lead-documentos');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'storage_chat_docs_authenticated_delete'
  ) then
    create policy storage_chat_docs_authenticated_delete
      on storage.objects for delete
      to authenticated
      using (bucket_id = 'chat-lead-documentos');
  end if;
end $$;

insert into public.modules_config (module_name, enabled)
values
  ('chat_interno', true),
  ('crm', true),
  ('agendamentos', true)
on conflict (module_name) do update set enabled = excluded.enabled;
