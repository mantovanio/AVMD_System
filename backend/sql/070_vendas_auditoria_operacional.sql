create table if not exists vendas_auditoria_operacional (
  id uuid primary key default gen_random_uuid(),
  acao text not null check (acao in ('cancelamento', 'exclusao')),
  venda_id uuid not null,
  pedido_numero text,
  protocolo_numero text,
  cliente_nome text,
  documento text,
  status_venda text,
  motivo text,
  cancelamento_id uuid,
  actor_id uuid,
  actor_nome text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_vendas_auditoria_operacional_venda on vendas_auditoria_operacional (venda_id, created_at desc);
create index if not exists idx_vendas_auditoria_operacional_acao on vendas_auditoria_operacional (acao, created_at desc);
