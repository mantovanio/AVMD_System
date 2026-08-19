-- =============================================================
-- 102: CHAT QUICK REPLY TEMPLATES
-- =============================================================
-- Banco de mensagens prontas para o chat, ativadas com "\"
-- Suporta texto + anexos (audio, imagem, arquivo).

CREATE TABLE IF NOT EXISTS chat_quick_replies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shortcut    TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  category    TEXT,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  ativo       BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index para busca por shortcut
CREATE INDEX IF NOT EXISTS idx_quick_reply_shortcut ON chat_quick_replies (shortcut);

-- Index para busca por categoria
CREATE INDEX IF NOT EXISTS idx_quick_reply_category ON chat_quick_replies (category) WHERE category IS NOT NULL;

-- Comentarios na tabela
COMMENT ON TABLE chat_quick_replies IS 'Mensagens rapidas para o chat, ativadas com \ no composer';
COMMENT ON COLUMN chat_quick_replies.shortcut IS 'Atalho para acionar a mensagem (sem \). Ex: "obrigado"';
COMMENT ON COLUMN chat_quick_replies.body IS 'Corpo da mensagem';
COMMENT ON COLUMN chat_quick_replies.attachments IS 'Array JSON de anexos: [{url, filename, mime_type, size}]';
COMMENT ON COLUMN chat_quick_replies.category IS 'Categoria para agrupar (ex: "agendamento", "pos-venda")';
