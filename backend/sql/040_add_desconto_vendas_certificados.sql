alter table vendas_certificados
  add column if not exists desconto numeric(12,2) not null default 0;
