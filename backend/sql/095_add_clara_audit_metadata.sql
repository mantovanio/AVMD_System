ALTER TABLE crm_chat_messages
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_crm_chat_messages_clara_intent
  ON crm_chat_messages ((metadata->>'clara_intent'))
  WHERE metadata ? 'clara_intent';

CREATE INDEX IF NOT EXISTS idx_crm_chat_messages_clara_source
  ON crm_chat_messages ((metadata->>'source'))
  WHERE metadata ? 'source';
