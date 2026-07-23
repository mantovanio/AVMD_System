update vendas_certificados vc
   set valor_custo = coalesce(c.valor_custo_ac, c.valor_custo, 0),
       metadata = jsonb_set(
         coalesce(vc.metadata, '{}'::jsonb),
         '{safeweb_financeiro,financeiro,valor_custo_certificado}',
         to_jsonb(coalesce(c.valor_custo_ac, c.valor_custo, 0)),
         true
       ),
       updated_at = now()
  from certificados c
 where vc.certificado_id = c.id
   and vc.metadata->>'origem_layout' = 'safeweb_financeiro'
   and coalesce(vc.valor_custo, 0) = 0
   and coalesce(c.valor_custo_ac, c.valor_custo, 0) > 0;
