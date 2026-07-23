with parsed as (
  select
    id,
    case
      when boleto_clean = '' or boleto_clean = '-' then 0::numeric
      when boleto_clean like '%,%' and boleto_clean like '%.%' then replace(replace(boleto_clean, '.', ''), ',', '.')::numeric
      when boleto_clean like '%,%' then replace(boleto_clean, ',', '.')::numeric
      else boleto_clean::numeric
    end as custo_ac
  from (
    select
      id,
      regexp_replace(coalesce(metadata->'safeweb_financeiro'->'linha_original'->>'valor_do_boleto', ''), '[R$\s]', '', 'g') as boleto_clean
    from vendas_certificados
    where metadata->>'origem_layout' = 'safeweb_financeiro'
      and coalesce(metadata->'safeweb_financeiro'->'gestao_ar'->>'valor_venda', '') = ''
  ) src
)
update vendas_certificados vc
   set valor_custo = p.custo_ac,
       valor_venda = 0,
       metadata = jsonb_set(
         jsonb_set(
           jsonb_set(
             coalesce(vc.metadata, '{}'::jsonb),
             '{safeweb_financeiro,financeiro,valor_boleto}',
             to_jsonb(p.custo_ac),
             true
           ),
           '{safeweb_financeiro,financeiro,valor_custo_certificado}',
           to_jsonb(p.custo_ac),
           true
         ),
         '{safeweb_financeiro,financeiro,valor_venda}',
         '0'::jsonb,
         true
       ),
       updated_at = now()
  from parsed p
 where vc.id = p.id;
