-- 029_link_crm_customers_to_cadastro_base.sql
-- Vincula contatos do CRM Chat ao cadastro mestre em cadastros_base.

ALTER TABLE crm_customers
  ADD COLUMN IF NOT EXISTS cadastro_base_id UUID REFERENCES cadastros_base(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crm_customers_cadastro_base_id
  ON crm_customers (cadastro_base_id);

WITH ranked_match AS (
  SELECT
    cust.id AS crm_customer_id,
    cb.id AS cadastro_base_id,
    ROW_NUMBER() OVER (
      PARTITION BY cust.id
      ORDER BY
        CASE
          WHEN regexp_replace(coalesce(cust.cpf, ''), '\D', '', 'g') <> ''
            AND regexp_replace(coalesce(cust.cpf, ''), '\D', '', 'g') = regexp_replace(coalesce(cb.cpf_cnpj, ''), '\D', '', 'g') THEN 1
          WHEN regexp_replace(coalesce(cust.cnpj, ''), '\D', '', 'g') <> ''
            AND regexp_replace(coalesce(cust.cnpj, ''), '\D', '', 'g') = regexp_replace(coalesce(cb.cpf_cnpj, ''), '\D', '', 'g') THEN 1
          WHEN regexp_replace(coalesce(cust.telefone, ''), '\D', '', 'g') <> ''
            AND right(regexp_replace(coalesce(cust.telefone, ''), '\D', '', 'g'), 11) = right(regexp_replace(coalesce(cb.telefone, ''), '\D', '', 'g'), 11) THEN 2
          WHEN lower(coalesce(cust.email, '')) <> ''
            AND lower(coalesce(cust.email, '')) = lower(coalesce(cb.email, '')) THEN 3
          ELSE 99
        END,
        cb.updated_at DESC NULLS LAST,
        cb.created_at DESC NULLS LAST
    ) AS rn
  FROM crm_customers cust
  JOIN cadastros_base cb
    ON (
      regexp_replace(coalesce(cust.cpf, ''), '\D', '', 'g') <> ''
      AND regexp_replace(coalesce(cust.cpf, ''), '\D', '', 'g') = regexp_replace(coalesce(cb.cpf_cnpj, ''), '\D', '', 'g')
    )
    OR (
      regexp_replace(coalesce(cust.cnpj, ''), '\D', '', 'g') <> ''
      AND regexp_replace(coalesce(cust.cnpj, ''), '\D', '', 'g') = regexp_replace(coalesce(cb.cpf_cnpj, ''), '\D', '', 'g')
    )
    OR (
      regexp_replace(coalesce(cust.telefone, ''), '\D', '', 'g') <> ''
      AND right(regexp_replace(coalesce(cust.telefone, ''), '\D', '', 'g'), 11) = right(regexp_replace(coalesce(cb.telefone, ''), '\D', '', 'g'), 11)
    )
    OR (
      lower(coalesce(cust.email, '')) <> ''
      AND lower(coalesce(cust.email, '')) = lower(coalesce(cb.email, ''))
    )
  WHERE cust.cadastro_base_id IS NULL
),
chosen AS (
  SELECT crm_customer_id, cadastro_base_id
  FROM ranked_match
  WHERE rn = 1
)
UPDATE crm_customers cust
SET cadastro_base_id = chosen.cadastro_base_id,
    updated_at = NOW()
FROM chosen
WHERE cust.id = chosen.crm_customer_id;
