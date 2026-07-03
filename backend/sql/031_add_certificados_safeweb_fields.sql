alter table certificados
  add column if not exists status_produto text not null default 'Ativo',
  add column if not exists validade_meses integer;

update certificados
set status_produto = case when ativo then 'Ativo' else 'Inativo' end
where status_produto is null or btrim(status_produto) = '';
