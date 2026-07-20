-- 055_add_renovacao_envio_flags.sql
-- Adiciona flags de envio por canal na tabela renovacoes

ALTER TABLE renovacoes
  ADD COLUMN IF NOT EXISTS enviou_email    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enviou_whatsapp BOOLEAN NOT NULL DEFAULT false;
