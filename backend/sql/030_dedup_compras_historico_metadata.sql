-- Remove duplicidades ja existentes no metadata.compras_historico de cadastros_base
-- e padroniza a import_key dos itens que ja possuem chave derivavel.

WITH candidatos AS (
  SELECT
    cb.id,
    cb.metadata
  FROM cadastros_base cb
  WHERE jsonb_typeof(cb.metadata -> 'compras_historico') = 'array'
),
expandido AS (
  SELECT
    c.id,
    e.ord,
    e.item,
    lower(trim(
      coalesce(
        nullif(e.item ->> 'import_key', ''),
        concat_ws('|',
          coalesce(e.item ->> 'documento_titular', ''),
          coalesce(e.item ->> 'pedido', ''),
          coalesce(e.item ->> 'protocolo', ''),
          coalesce(e.item ->> 'produto', ''),
          coalesce(e.item ->> 'tipo', ''),
          coalesce(e.item ->> 'validade', ''),
          coalesce(e.item ->> 'vencimento', ''),
          coalesce(
            nullif(
              regexp_replace(
                replace(coalesce(e.item ->> 'valor_compra', ''), ',', '.'),
                '[^0-9.\\-]',
                '',
                'g'
              ),
              ''
            ),
            ''
          )
        )
      )
    )) AS raw_key
  FROM candidatos c
  CROSS JOIN LATERAL jsonb_array_elements(c.metadata -> 'compras_historico') WITH ORDINALITY AS e(item, ord)
),
normalizado AS (
  SELECT
    id,
    ord,
    CASE WHEN raw_key = '' THEN 'sem-chave:' || ord::text ELSE raw_key END AS dedup_key,
    CASE
      WHEN raw_key = '' THEN item
      ELSE (item - 'import_key') || jsonb_build_object('import_key', raw_key)
    END AS item_normalizado
  FROM expandido
),
ranqueado AS (
  SELECT
    id,
    ord,
    dedup_key,
    item_normalizado,
    row_number() OVER (PARTITION BY id, dedup_key ORDER BY ord) AS rn
  FROM normalizado
),
reconstruido AS (
  SELECT
    id,
    jsonb_agg(item_normalizado ORDER BY ord) AS compras_historico
  FROM ranqueado
  WHERE rn = 1
  GROUP BY id
)
UPDATE cadastros_base cb
SET
  metadata = (coalesce(cb.metadata, '{}'::jsonb) - 'compras_historico')
    || jsonb_build_object('compras_historico', coalesce(r.compras_historico, '[]'::jsonb)),
  updated_at = now()
FROM reconstruido r
WHERE cb.id = r.id;
