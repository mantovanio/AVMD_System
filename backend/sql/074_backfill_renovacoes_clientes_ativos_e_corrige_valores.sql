-- Backfill das renovações:
-- 1) vincula cadastro_base_id quando houver cliente ativo compatível
-- 2) corrige valores importados com deslocamento decimal (ex.: 3200 -> 32)

UPDATE renovacoes r
   SET cadastro_base_id = cb.id,
       updated_at = now()
  FROM cadastros_base cb
 WHERE r.deleted_at IS NULL
   AND r.cadastro_base_id IS NULL
   AND (
     (
       nullif(regexp_replace(coalesce(r.cpf, ''), '\D', '', 'g'), '') IS NOT NULL
       AND regexp_replace(coalesce(cb.cpf_cnpj, ''), '\D', '', 'g') = regexp_replace(coalesce(r.cpf, ''), '\D', '', 'g')
     )
     OR (
       nullif(regexp_replace(coalesce(r.cnpj, ''), '\D', '', 'g'), '') IS NOT NULL
       AND regexp_replace(coalesce(cb.cpf_cnpj, ''), '\D', '', 'g') = regexp_replace(coalesce(r.cnpj, ''), '\D', '', 'g')
     )
     OR (
       nullif(regexp_replace(coalesce(r.telefone, ''), '\D', '', 'g'), '') IS NOT NULL
       AND fn_normalize_phone_br(cb.telefone) = fn_normalize_phone_br(r.telefone)
     )
   );

UPDATE renovacoes
   SET valor = round(valor / 100.0, 2),
       updated_at = now()
 WHERE deleted_at IS NULL
   AND valor IS NOT NULL
   AND valor >= 1000
   AND valor < 10000
   AND mod(valor, 100) = 0;

