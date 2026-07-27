CREATE TABLE IF NOT EXISTS crm_chat_history_archives (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID NOT NULL REFERENCES crm_chat_conversations(id) ON DELETE CASCADE,
  cycle_started_at  TIMESTAMPTZ,
  cycle_ended_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  message_count     INTEGER NOT NULL DEFAULT 0,
  incoming_count    INTEGER NOT NULL DEFAULT 0,
  outgoing_count    INTEGER NOT NULL DEFAULT 0,
  summary           TEXT,
  snapshot          JSONB NOT NULL DEFAULT '{}'::jsonb,
  archived_by       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_history_archives_conversation
  ON crm_chat_history_archives (conversation_id, cycle_ended_at DESC);
