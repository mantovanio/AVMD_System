-- ============================================================
-- 045_followup_progressivo_outbox.sql
-- Adiciona 'processing' ao CHECK constraint do outbox e coluna external_id
-- para suportar o sistema de follow-up progressivo de renovações.
-- ============================================================

-- Adicionar 'processing' ao CHECK constraint do status
ALTER TABLE communication_outbox
  DROP CONSTRAINT IF EXISTS communication_outbox_status_check;

ALTER TABLE communication_outbox
  ADD CONSTRAINT communication_outbox_status_check
    CHECK (status IN ('pending','processing','sent','failed'));

-- Adicionar coluna external_id se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'communication_outbox' AND column_name = 'external_id'
  ) THEN
    ALTER TABLE communication_outbox ADD COLUMN external_id TEXT;
  END IF;
END $$;
