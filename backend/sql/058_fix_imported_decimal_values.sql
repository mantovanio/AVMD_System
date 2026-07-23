update vendas_certificados
   set valor_venda = 32.00,
       updated_at = now()
 where created_at >= '2026-07-23 00:00:00-03'
   and valor_venda = 3200.00
   and coalesce(status_venda, '') <> 'cancelado';

update vendas_certificados
   set valor_venda = 37.00,
       updated_at = now()
 where created_at >= '2026-07-23 00:00:00-03'
   and valor_venda = 3700.00
   and coalesce(status_venda, '') <> 'cancelado';
