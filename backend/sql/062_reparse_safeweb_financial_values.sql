with parsed as (
  select
    id,
    case
      when boleto_clean = '' or boleto_clean = '-' then 0::numeric
      when boleto_clean like '%,%' and boleto_clean like '%.%' then replace(replace(boleto_clean, '.', ''), ',', '.')::numeric
      when boleto_clean like '%,%' then replace(boleto_clean, ',', '.')::numeric
      else boleto_clean::numeric
    end as valor_boleto,
    case
      when voucher_valor_clean = '' or voucher_valor_clean = '-' then null::numeric
      when voucher_valor_clean like '%,%' and voucher_valor_clean like '%.%' then replace(replace(voucher_valor_clean, '.', ''), ',', '.')::numeric
      when voucher_valor_clean like '%,%' then replace(voucher_valor_clean, ',', '.')::numeric
      else voucher_valor_clean::numeric
    end as voucher_valor,
    case
      when voucher_percentual_clean = '' or voucher_percentual_clean = '-' then null::numeric
      when voucher_percentual_clean like '%,%' and voucher_percentual_clean like '%.%' then replace(replace(voucher_percentual_clean, '.', ''), ',', '.')::numeric
      when voucher_percentual_clean like '%,%' then replace(voucher_percentual_clean, ',', '.')::numeric
      else voucher_percentual_clean::numeric
    end as voucher_percentual
  from (
    select
      id,
      regexp_replace(coalesce(metadata->'safeweb_financeiro'->'linha_original'->>'valor_do_boleto', ''), '[R$\s]', '', 'g') as boleto_clean,
      regexp_replace(coalesce(metadata->'safeweb_financeiro'->'linha_original'->>'vouchervalor', ''), '[R$\s]', '', 'g') as voucher_valor_clean,
      regexp_replace(coalesce(metadata->'safeweb_financeiro'->'linha_original'->>'voucherpercentual', ''), '[R$\s]', '', 'g') as voucher_percentual_clean
    from vendas_certificados
    where metadata->>'origem_layout' = 'safeweb_financeiro'
  ) src
)
update vendas_certificados vc
   set valor_venda = p.valor_boleto,
       voucher_valor = p.voucher_valor,
       voucher_percentual = p.voucher_percentual,
       metadata = jsonb_set(
         jsonb_set(
           jsonb_set(
             coalesce(vc.metadata, '{}'::jsonb),
             '{safeweb_financeiro,financeiro,valor_boleto}',
             to_jsonb(p.valor_boleto),
             true
           ),
           '{safeweb_financeiro,financeiro,voucher_valor}',
           to_jsonb(coalesce(p.voucher_valor, 0)),
           true
         ),
         '{safeweb_financeiro,financeiro,voucher_percentual}',
         to_jsonb(coalesce(p.voucher_percentual, 0)),
         true
       ),
       updated_at = now()
  from parsed p
 where vc.id = p.id;
