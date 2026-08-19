-- Adiciona campo metadata jsonb na tabela certificados para armazenar IDs da Senha Digital Plus
-- e outros dados de integração externa.

ALTER TABLE certificados ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
