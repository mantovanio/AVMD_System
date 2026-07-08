create sequence if not exists vendas_pedido_numero_seq start with 18000;

update vendas_certificados
set pedido_numero = nextval('vendas_pedido_numero_seq')::text
where pedido_numero is null;
