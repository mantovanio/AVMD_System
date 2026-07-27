-- 075_add_renovacao_status_disparo.sql
-- Separa o status comercial da renovacao do status de disparo automatico

ALTER TABLE renovacoes
  ADD COLUMN IF NOT EXISTS status_disparo TEXT NOT NULL DEFAULT 'nao_disparado';

UPDATE renovacoes
   SET status_disparo = CASE
     WHEN coalesce(ultimo_lembrete, created_at) IS NOT NULL THEN 'enviado'
     ELSE 'nao_disparado'
   END
 WHERE status_disparo = 'nao_disparado'
   AND coalesce(ultimo_lembrete, created_at) IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_renovacoes_status_disparo ON renovacoes (status_disparo);
