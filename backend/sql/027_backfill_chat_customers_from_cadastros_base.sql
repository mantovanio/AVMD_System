-- Vincula conversas de atendimento a crm_customers usando cadastros_base
-- quando houver match seguro por telefone.

WITH matched AS (
  SELECT
    conv.id AS conversation_id,
    conv.cliente_nome AS conversation_name,
    conv.telefone AS conversation_phone,
    conv.document_key,
    cb.id AS cadastro_base_id,
    cb.nome AS cadastro_nome,
    cb.email AS cadastro_email,
    cb.telefone AS cadastro_telefone,
    regexp_replace(COALESCE(cb.cpf_cnpj, ''), '[^0-9]', '', 'g') AS cadastro_documento,
    ROW_NUMBER() OVER (
      PARTITION BY conv.id
      ORDER BY cb.updated_at DESC NULLS LAST, cb.created_at DESC NULLS LAST
    ) AS rn
  FROM crm_chat_conversations conv
  JOIN cadastros_base cb
    ON RIGHT(regexp_replace(COALESCE(cb.telefone, ''), '\D', '', 'g'), 11) =
       RIGHT(regexp_replace(COALESCE(conv.telefone, conv.document_key, ''), '\D', '', 'g'), 11)
  WHERE conv.fila = 'atendimento'
    AND conv.crm_customer_id IS NULL
    AND conv.document_key NOT LIKE '%@lid'
    AND conv.document_key NOT LIKE '%@hosted.lid'
), chosen AS (
  SELECT *
  FROM matched
  WHERE rn = 1
), existing_customer AS (
  SELECT
    chosen.conversation_id,
    cust.id AS customer_id
  FROM chosen
  JOIN crm_customers cust
    ON (
      chosen.cadastro_email IS NOT NULL
      AND chosen.cadastro_email <> ''
      AND LOWER(COALESCE(cust.email, '')) = LOWER(chosen.cadastro_email)
    )
    OR (
      regexp_replace(COALESCE(cust.telefone, ''), '\D', '', 'g') =
      regexp_replace(COALESCE(chosen.cadastro_telefone, ''), '\D', '', 'g')
    )
    OR (
      LENGTH(chosen.cadastro_documento) <= 11
      AND chosen.cadastro_documento <> ''
      AND regexp_replace(COALESCE(cust.cpf, ''), '\D', '', 'g') = chosen.cadastro_documento
    )
    OR (
      LENGTH(chosen.cadastro_documento) > 11
      AND regexp_replace(COALESCE(cust.cnpj, ''), '\D', '', 'g') = chosen.cadastro_documento
    )
), inserted_customer AS (
  INSERT INTO crm_customers (nome, telefone, email, cpf, cnpj, observacoes, contato_status)
  SELECT
    chosen.cadastro_nome,
    chosen.cadastro_telefone,
    chosen.cadastro_email,
    CASE WHEN LENGTH(chosen.cadastro_documento) <= 11 AND chosen.cadastro_documento <> '' THEN chosen.cadastro_documento ELSE NULL END AS cpf,
    CASE WHEN LENGTH(chosen.cadastro_documento) > 11 THEN chosen.cadastro_documento ELSE NULL END AS cnpj,
    'Vinculado automaticamente a partir de cadastros_base.',
    'conversando'
  FROM chosen
  LEFT JOIN existing_customer existing
    ON existing.conversation_id = chosen.conversation_id
  WHERE existing.customer_id IS NULL
  RETURNING id, telefone, email
), resolved_customer AS (
  SELECT
    chosen.conversation_id,
    COALESCE(
      existing.customer_id,
      inserted.id
    ) AS customer_id,
    chosen.cadastro_nome
  FROM chosen
  LEFT JOIN existing_customer existing
    ON existing.conversation_id = chosen.conversation_id
  LEFT JOIN inserted_customer inserted
    ON regexp_replace(COALESCE(inserted.telefone, ''), '\D', '', 'g') =
       regexp_replace(COALESCE(chosen.cadastro_telefone, ''), '\D', '', 'g')
       OR (
         chosen.cadastro_email IS NOT NULL
         AND chosen.cadastro_email <> ''
         AND LOWER(COALESCE(inserted.email, '')) = LOWER(chosen.cadastro_email)
       )
)
UPDATE crm_chat_conversations conv
SET
  crm_customer_id = resolved.customer_id,
  cliente_nome = CASE
    WHEN conv.cliente_nome IS NULL OR btrim(conv.cliente_nome) = '' OR conv.cliente_nome = 'Você' OR conv.cliente_nome = conv.document_key OR conv.cliente_nome = conv.telefone
      THEN resolved.cadastro_nome
    ELSE conv.cliente_nome
  END,
  updated_at = NOW()
FROM resolved_customer resolved
WHERE conv.id = resolved.conversation_id
  AND resolved.customer_id IS NOT NULL;
