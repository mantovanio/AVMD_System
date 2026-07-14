-- 049: Adiciona codigo_alternativo e combo_produtos na tabela certificados
-- codigo_alternativo: código secundário do produto (ex: código Safeweb, código interno da AC)
-- combo_produtos: array JSON com IDs de certificados associados para venda combo

ALTER TABLE certificados
  ADD COLUMN IF NOT EXISTS codigo_alternativo text,
  ADD COLUMN IF NOT EXISTS combo_produtos jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN certificados.codigo_alternativo IS 'Código alternativo do produto (ex: código Safeweb, código interno da AC)';
COMMENT ON COLUMN certificados.combo_produtos IS 'Array JSON com IDs de certificados associados para venda combo';
