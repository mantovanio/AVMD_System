create table if not exists external_integrations (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  name text not null,
  description text,
  status text not null default 'pendente',
  base_url text,
  webhook_url text,
  api_token text,
  account_id text,
  inbox_id text,
  instance_name text,
  sender_name text,
  sender_email text,
  host text,
  port integer,
  username text,
  metadata jsonb not null default '{}'::jsonb,
  last_test_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_external_integrations_provider on external_integrations(provider);

insert into external_integrations (
  provider, name, description, base_url, webhook_url, status, metadata, created_at, updated_at
)
select
  'mercado_pago',
  'Mercado Pago',
  'Checkout Pro para cobranças das vendas',
  'https://api.mercadopago.com',
  'https://api.certiid.mantovan.com.br/api/checkout/webhook/mercado-pago',
  'pendente',
  jsonb_build_object('is_sandbox', true),
  now(),
  now()
where not exists (select 1 from external_integrations where provider = 'mercado_pago');
