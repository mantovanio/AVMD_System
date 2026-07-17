do $$
begin
  if exists (
    select 1
    from vendas_certificados
    where pedido_numero is not null
    group by pedido_numero
    having count(*) > 1
    limit 1
  ) then
    raise exception 'Nao foi possivel criar a unicidade de pedido_numero porque existem duplicidades na base.';
  end if;

  if exists (
    select 1
    from vendas_certificados
    where protocolo_numero is not null
    group by protocolo_numero
    having count(*) > 1
    limit 1
  ) then
    raise exception 'Nao foi possivel criar a unicidade de protocolo_numero porque existem duplicidades na base.';
  end if;
end $$;

create unique index if not exists ux_vendas_certificados_pedido_numero
  on vendas_certificados (pedido_numero)
  where pedido_numero is not null;

create unique index if not exists ux_vendas_certificados_protocolo_numero
  on vendas_certificados (protocolo_numero)
  where protocolo_numero is not null;
