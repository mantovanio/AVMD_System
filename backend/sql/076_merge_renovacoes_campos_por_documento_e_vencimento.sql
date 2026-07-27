-- Backfill das renovações atuais:
-- completa protocolo, contato e demais campos básicos quando houver
-- linhas irmãs da mesma renovação separadas por importacoes parciais.

WITH ranked AS (
  SELECT
    id,
    coalesce(
      nullif(regexp_replace(coalesce(cpf, ''), '\D', '', 'g'), ''),
      nullif(regexp_replace(coalesce(cnpj, ''), '\D', '', 'g'), '')
    ) AS doc_key,
    data_vencimento::date AS venc_key,
    protocolo,
    pedido,
    cliente,
    email,
    telefone,
    razao_social,
    agr,
    vendedor,
    contador,
    cadastro_base_id,
    row_number() OVER (
      PARTITION BY
        coalesce(
          nullif(regexp_replace(coalesce(cpf, ''), '\D', '', 'g'), ''),
          nullif(regexp_replace(coalesce(cnpj, ''), '\D', '', 'g'), '')
        ),
        data_vencimento::date
      ORDER BY
        (protocolo IS NOT NULL)::int DESC,
        (pedido IS NOT NULL)::int DESC,
        (email IS NOT NULL)::int DESC,
        (telefone IS NOT NULL)::int DESC,
        (cliente IS NOT NULL)::int DESC,
        updated_at DESC
    ) AS rn
  FROM renovacoes
  WHERE deleted_at IS NULL
)
UPDATE renovacoes r
   SET protocolo = coalesce(r.protocolo, b.protocolo),
       pedido = coalesce(r.pedido, b.pedido),
       cliente = coalesce(r.cliente, b.cliente),
       email = coalesce(r.email, b.email),
       telefone = coalesce(r.telefone, b.telefone),
       razao_social = coalesce(r.razao_social, b.razao_social),
       agr = coalesce(r.agr, b.agr),
       vendedor = coalesce(r.vendedor, b.vendedor),
       contador = coalesce(r.contador, b.contador),
       cadastro_base_id = coalesce(r.cadastro_base_id, b.cadastro_base_id),
       updated_at = now()
  FROM ranked b
 WHERE r.deleted_at IS NULL
   AND b.rn = 1
   AND r.id <> b.id
   AND r.data_vencimento::date = b.venc_key
   AND coalesce(
         nullif(regexp_replace(coalesce(r.cpf, ''), '\D', '', 'g'), ''),
         nullif(regexp_replace(coalesce(r.cnpj, ''), '\D', '', 'g'), '')
       ) = b.doc_key
   AND (
     r.protocolo IS NULL
     OR r.pedido IS NULL
     OR r.cliente IS NULL
     OR r.email IS NULL
     OR r.telefone IS NULL
     OR r.razao_social IS NULL
     OR r.agr IS NULL
     OR r.vendedor IS NULL
     OR r.contador IS NULL
     OR r.cadastro_base_id IS NULL
   );
