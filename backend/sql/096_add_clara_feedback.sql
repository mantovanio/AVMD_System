CREATE TABLE IF NOT EXISTS clara_response_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NULL REFERENCES crm_chat_conversations(id) ON DELETE SET NULL,
  message_id UUID NULL REFERENCES crm_chat_messages(id) ON DELETE SET NULL,
  reviewer_profile_id UUID NULL REFERENCES profiles(id) ON DELETE SET NULL,
  rating TEXT NOT NULL CHECK (rating IN ('boa', 'corrigir', 'risco')),
  original_message TEXT NULL,
  corrected_response TEXT NULL,
  notes TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clara_response_feedback_message
  ON clara_response_feedback(message_id);

CREATE INDEX IF NOT EXISTS idx_clara_response_feedback_conversation
  ON clara_response_feedback(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_clara_response_feedback_rating
  ON clara_response_feedback(rating, created_at DESC);
