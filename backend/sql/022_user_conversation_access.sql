-- 022_user_conversation_access.sql
-- Permite definir manualmente quais numeros/telefones cada usuario pode ver no chat

CREATE TABLE IF NOT EXISTS user_conversation_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  telefone text NOT NULL,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, telefone)
);

CREATE INDEX IF NOT EXISTS idx_user_conversation_access_user ON user_conversation_access (user_id);
