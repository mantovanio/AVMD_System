-- ============================================================
-- 053: Completar precos dos certificados que ficaram com preco = 0
-- Baseado nas regras do usuario:
--   valor_custo_ac = 30.00
--   e-CPF/PF: 12m=169.90, 24m=189.90, 36m=209.90, custoAR=89.90
--   e-CNPJ/PJ: 12m=249.90, 24m=279.90, 36m=319.90, custoAR=89.90
--   SafeID e-CPF/PF 4m: 79.90, custoAR=56.90
--   SafeID e-CNPJ/PJ 4m: 99.90, custoAR=59.90
--   Adicionais: cartao +40v/+10c, token +90v/+40c, leitora +90v/+40c
-- ============================================================

-- Resetar todos para 0 primeiro para evitar acumulo
UPDATE certificados SET preco_venda = 0, valor_custo_ac = 30.00, valor_custo = 0;

-- ── e-CPF / e-PF (12 meses) ───────────────────────────────
UPDATE certificados
SET preco_venda = 169.90, valor_custo_ac = 30.00, valor_custo = 89.90
WHERE categoria IN ('e-CPF', 'e-PF')
  AND validade_meses = 12
  AND tipo NOT ILIKE '%safeid%';

-- e-CPF / e-PF (24 meses)
UPDATE certificados
SET preco_venda = 189.90, valor_custo_ac = 30.00, valor_custo = 89.90
WHERE categoria IN ('e-CPF', 'e-PF')
  AND validade_meses = 24
  AND tipo NOT ILIKE '%safeid%';

-- e-CPF / e-PF (36 meses)
UPDATE certificados
SET preco_venda = 209.90, valor_custo_ac = 30.00, valor_custo = 89.90
WHERE categoria IN ('e-CPF', 'e-PF')
  AND validade_meses = 36
  AND tipo NOT ILIKE '%safeid%';

-- ── e-CNPJ / e-PJ (12 meses) ──────────────────────────────
UPDATE certificados
SET preco_venda = 249.90, valor_custo_ac = 30.00, valor_custo = 89.90
WHERE categoria IN ('e-CNPJ', 'e-PJ')
  AND validade_meses = 12
  AND tipo NOT ILIKE '%safeid%';

-- e-CNPJ / e-PJ (24 meses)
UPDATE certificados
SET preco_venda = 279.90, valor_custo_ac = 30.00, valor_custo = 89.90
WHERE categoria IN ('e-CNPJ', 'e-PJ')
  AND validade_meses = 24
  AND tipo NOT ILIKE '%safeid%';

-- e-CNPJ / e-PJ (36 meses)
UPDATE certificados
SET preco_venda = 319.90, valor_custo_ac = 30.00, valor_custo = 89.90
WHERE categoria IN ('e-CNPJ', 'e-PJ')
  AND validade_meses = 36
  AND tipo NOT ILIKE '%safeid%';

-- ── SafeID e-CPF / e-PF (4 meses = 120 dias) ──────────────
UPDATE certificados
SET preco_venda = 79.90, valor_custo_ac = 30.00, valor_custo = 56.90
WHERE tipo ILIKE '%safeid%'
  AND (categoria IN ('e-CPF', 'e-PF') OR tipo ILIKE '%cpf%' OR tipo ILIKE '%pf%')
  AND validade_meses <= 4;

-- SafeID e-CNPJ / e-PJ (4 meses)
UPDATE certificados
SET preco_venda = 99.90, valor_custo_ac = 30.00, valor_custo = 59.90
WHERE tipo ILIKE '%safeid%'
  AND (categoria IN ('e-CNPJ', 'e-PJ') OR tipo ILIKE '%cnpj%' OR tipo ILIKE '%pj%')
  AND validade_meses <= 4;

-- SafeID 24 meses (mesmo preco do safeid 4m * 2, mas seguindo a regra do usuario = manter 79.90/99.90)
-- Nao alterar - manter como esta

-- ── Adicionais: cartao, token, leitora ─────────────────────
-- Cartão: +40 venda, +10 custo
UPDATE certificados
SET preco_venda = preco_venda + 40.00,
    valor_custo_ac = valor_custo_ac + 10.00,
    valor_custo = valor_custo + 10.00
WHERE preco_venda > 0
  AND tipo ILIKE '%cartao%'
  AND tipo NOT ILIKE '%leitora%'
  AND tipo NOT ILIKE '%token%';

-- Token: +90 venda, +40 custo
UPDATE certificados
SET preco_venda = preco_venda + 90.00,
    valor_custo_ac = valor_custo_ac + 40.00,
    valor_custo = valor_custo + 40.00
WHERE preco_venda > 0
  AND tipo ILIKE '%token%'
  AND tipo NOT ILIKE '%leitora%';

-- Leitora: +90 venda, +40 custo
UPDATE certificados
SET preco_venda = preco_venda + 90.00,
    valor_custo_ac = valor_custo_ac + 40.00,
    valor_custo = valor_custo + 40.00
WHERE preco_venda > 0
  AND tipo ILIKE '%leitora%';

-- ── Resultado ──────────────────────────────────────────────
SELECT codigo, tipo, categoria, validade, validade_meses, preco_venda, valor_custo_ac, valor_custo, ativo
FROM certificados
WHERE ativo = true
ORDER BY categoria, validade_meses, tipo;
