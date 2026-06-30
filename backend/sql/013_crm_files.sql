-- Tabela de arquivos anexados a conversas (CRM Chat)
-- Usado para documentos pessoais, contratos, notas, etc.
CREATE TABLE IF NOT EXISTS crm_conversation_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id TEXT NOT NULL,
  original_name TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  uploaded_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_conversation_files_conversation ON crm_conversation_files(conversation_id);

-- Anexos aparecem como mensagens no timeline da conversa via communication_events
-- Cada upload gera um evento com event_type='file_uploaded' e payload com metadados do arquivo

ALTER TABLE crm_conversation_files ENABLE ROW LEVEL SECURITY;
