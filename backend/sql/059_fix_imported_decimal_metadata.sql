update vendas_certificados
   set metadata = jsonb_set(metadata, '{safeweb_financeiro,financeiro,valor_boleto}', '32'::jsonb, true),
       updated_at = now()
 where created_at >= '2026-07-23 00:00:00-03'
   and metadata->'safeweb_financeiro'->'financeiro'->>'valor_boleto' = '3200'
   and metadata->'safeweb_financeiro'->'linha_original'->>'valor_do_boleto' in ('R$ 32.00', '32.00');

update vendas_certificados
   set metadata = jsonb_set(metadata, '{safeweb_financeiro,financeiro,valor_boleto}', '37'::jsonb, true),
       updated_at = now()
 where created_at >= '2026-07-23 00:00:00-03'
   and metadata->'safeweb_financeiro'->'financeiro'->>'valor_boleto' = '3700'
   and metadata->'safeweb_financeiro'->'linha_original'->>'valor_do_boleto' in ('R$ 37.00', '37.00');
