-- ============================================================
-- 052: Popular precos na tabela certificados baseado em diretrizes
-- Regras:
--   valor_custo_ac = 30.00 para qualquer certificado
--   Adicionais (incluidos no nome do tipo):
--     cartao:   +40 venda, +10 custo AR
--     token:    +90 venda, +40 custo AR
--     leitora:  +90 venda, +40 custo AR
-- ============================================================

-- ── e-CPF / e-PF ──────────────────────────────────────────
-- 12 meses (A1 ou A3)
UPDATE certificados
SET preco_venda = 169.90, valor_custo_ac = 30.00, valor_custo = 89.90
WHERE categoria IN ('e-CPF', 'e-PF')
  AND (validade ILIKE '%12%mes%' OR validade ILIKE '%1%ano%' OR validade_meses = 12)
  AND tipo NOT ILIKE '%safeid%';

-- 24 meses (A3)
UPDATE certificados
SET preco_venda = 189.90, valor_custo_ac = 30.00, valor_custo = 89.90
WHERE categoria IN ('e-CPF', 'e-PF')
  AND (validade ILIKE '%24%mes%' OR validade ILIKE '%2%ano%' OR validade_meses = 24)
  AND tipo NOT ILIKE '%safeid%';

-- 36 meses (A3)
UPDATE certificados
SET preco_venda = 209.90, valor_custo_ac = 30.00, valor_custo = 89.90
WHERE categoria IN ('e-CPF', 'e-PF')
  AND (validade ILIKE '%36%mes%' OR validade ILIKE '%3%ano%' OR validade_meses = 36)
  AND tipo NOT ILIKE '%safeid%';

-- ── e-CNPJ / e-PJ ─────────────────────────────────────────
-- 12 meses (A1 ou A3)
UPDATE certificados
SET preco_venda = 249.90, valor_custo_ac = 30.00, valor_custo = 89.90
WHERE categoria IN ('e-CNPJ', 'e-PJ')
  AND (validade ILIKE '%12%mes%' OR validade ILIKE '%1%ano%' OR validade_meses = 12)
  AND tipo NOT ILIKE '%safeid%';

-- 24 meses (A3)
UPDATE certificados
SET preco_venda = 279.90, valor_custo_ac = 30.00, valor_custo = 89.90
WHERE categoria IN ('e-CNPJ', 'e-PJ')
  AND (validade ILIKE '%24%mes%' OR validade ILIKE '%2%ano%' OR validade_meses = 24)
  AND tipo NOT ILIKE '%safeid%';

-- 36 meses (A3)
UPDATE certificados
SET preco_venda = 319.90, valor_custo_ac = 30.00, valor_custo = 89.90
WHERE categoria IN ('e-CNPJ', 'e-PJ')
  AND (validade ILIKE '%36%mes%' OR validade ILIKE '%3%ano%' OR validade_meses = 36)
  AND tipo NOT ILIKE '%safeid%';

-- ── SafeID ─────────────────────────────────────────────────
-- e-CPF / PF safeID 4 meses
UPDATE certificados
SET preco_venda = 79.90, valor_custo_ac = 30.00, valor_custo = 56.90
WHERE tipo ILIKE '%safeid%'
  AND (categoria IN ('e-CPF', 'e-PF') OR tipo ILIKE '%cpf%' OR tipo ILIKE '%pf%')
  AND (validade ILIKE '%4%mes%' OR validade_meses = 4);

-- e-CNPJ / PJ safeID 4 meses
UPDATE certificados
SET preco_venda = 99.90, valor_custo_ac = 30.00, valor_custo = 59.90
WHERE tipo ILIKE '%safeid%'
  AND (categoria IN ('e-CNPJ', 'e-PJ') OR tipo ILIKE '%cnpj%' OR tipo ILIKE '%pj%')
  AND (validade ILIKE '%4%mes%' OR validade_meses = 4);

-- ── Adicionais: cartao, token, leitora ─────────────────────
-- Cartão: +40 venda, +10 custo
UPDATE certificados
SET preco_venda = preco_venda + 40.00,
    valor_custo = valor_custo + 10.00
WHERE preco_venda > 0
  AND tipo ILIKE '%cartao%'
  AND tipo NOT ILIKE '%leitora%'
  AND tipo NOT ILIKE '%token%';

-- Token: +90 venda, +40 custo
UPDATE certificados
SET preco_venda = preco_venda + 90.00,
    valor_custo = valor_custo + 40.00
WHERE preco_venda > 0
  AND tipo ILIKE '%token%'
  AND tipo NOT ILIKE '%leitora%';

-- Leitora: +90 venda, +40 custo
UPDATE certificados
SET preco_venda = preco_venda + 90.00,
    valor_custo = valor_custo + 40.00
WHERE preco_venda > 0
  AND tipo ILIKE '%leitora%';

-- ── Validação ──────────────────────────────────────────────
SELECT codigo, tipo, categoria, validade, preco_venda, valor_custo_ac, valor_custo, ativo
FROM certificados
WHERE preco_venda > 0
ORDER BY categoria, validade_meses, tipo;
