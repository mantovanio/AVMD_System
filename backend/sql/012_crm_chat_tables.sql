-- Tabelas do CRM Chat (ChatInboxCRM)
-- Criar antes da view

CREATE TABLE IF NOT EXISTS crm_customers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            TEXT,
  telefone        TEXT,
  email           TEXT,
  cpf             TEXT,
  cnpj            TEXT,
  observacoes     TEXT,
  contato_status  TEXT DEFAULT 'novo',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_chat_conversations (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_key           TEXT NOT NULL,
  telefone               TEXT,
  cliente_nome           TEXT,
  whatsapp_instance      TEXT,
  numero_receptor        TEXT,
  fila                   TEXT NOT NULL DEFAULT 'geral',
  kanban_status          TEXT NOT NULL DEFAULT 'iniciou_conversa',
  atendimento_humano     BOOLEAN NOT NULL DEFAULT false,
  agente_nome            TEXT,
  ultima_mensagem        TEXT,
  ultima_mensagem_direcao TEXT,
  ultima_interacao_em    TIMESTAMPTZ,
  crm_customer_id        UUID REFERENCES crm_customers(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conv_document_key   ON crm_chat_conversations (document_key);
CREATE INDEX IF NOT EXISTS idx_conv_ultima_interacao ON crm_chat_conversations (ultima_interacao_em DESC);

CREATE TABLE IF NOT EXISTS crm_chat_messages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id     UUID NOT NULL REFERENCES crm_chat_conversations(id),
  document_key        TEXT NOT NULL,
  external_message_id TEXT,
  direction           TEXT NOT NULL DEFAULT 'incoming',
  sender_type         TEXT NOT NULL DEFAULT 'contact',
  sender_name         TEXT,
  mensagem            TEXT,
  mime_type           TEXT,
  file_name           TEXT,
  media_url           TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_msg_conversation ON crm_chat_messages (conversation_id);
CREATE INDEX IF NOT EXISTS idx_msg_created      ON crm_chat_messages (created_at);

-- Atualizar crm_chat_assignments com coluna agente_nome
ALTER TABLE crm_chat_assignments ADD COLUMN IF NOT EXISTS agente_nome TEXT;

-- Função de sincronia: communication_events → crm_chat_messages + crm_chat_conversations
CREATE OR REPLACE FUNCTION fn_sync_communication_event()
RETURNS TRIGGER AS $$
DECLARE
  v_phone      TEXT;
  v_instance   TEXT;
  v_conv_id    UUID;
  v_direction  TEXT;
  v_sender_type TEXT;
  v_sender_name TEXT;
  v_content    TEXT;
  v_is_from_me BOOLEAN;
  v_kanban_status TEXT;
  v_cliente_nome TEXT;
  v_is_email    BOOLEAN;
  v_fila        TEXT;
BEGIN
  v_phone     := COALESCE(NEW.payload->>'from', NEW.payload->>'remoteJid', '');
  v_instance  := COALESCE(NEW.payload->>'instance_name', '');

  IF v_phone = '' AND NEW.conversation_id IS NOT NULL AND NEW.conversation_id <> '' THEN
    v_phone := NEW.conversation_id;
  END IF;

  IF v_phone IS NULL OR v_phone = '' THEN
    RETURN NEW;
  END IF;

  v_is_email := NEW.source = 'email' OR (v_phone LIKE '%@%' AND v_phone NOT LIKE '%@s.whatsapp.net' AND v_phone NOT LIKE '%@g.us' AND v_phone NOT LIKE '%@broadcast%');
  v_fila     := CASE WHEN v_is_email THEN 'email' ELSE 'geral' END;

  IF v_is_email THEN
    v_instance := COALESCE(v_instance, split_part(v_phone, '@', 2));
  ELSE
    v_phone := regexp_replace(v_phone, '[^0-9]', '', 'g');
    IF length(v_phone) < 10 OR length(v_phone) > 15 THEN
      RETURN NEW;
    END IF;
  END IF;

  v_is_from_me := (NEW.payload->>'fromMe')::boolean;
  v_content   := COALESCE(NEW.payload->>'content', NEW.payload->>'body', '');
  v_direction   := CASE WHEN v_is_from_me THEN 'outgoing' ELSE 'incoming' END;
  v_sender_type := CASE WHEN v_is_from_me THEN 'agent' ELSE 'contact' END;
  v_sender_name := CASE WHEN v_is_from_me THEN (NEW.payload->>'pushName') ELSE NULL END;
  v_kanban_status := NEW.payload->>'kanban_status';
  v_cliente_nome := COALESCE(NEW.payload->>'from_name', NEW.payload->>'pushName', NEW.payload->>'cliente_nome');

  INSERT INTO crm_chat_conversations (document_key, telefone, whatsapp_instance, fila, ultima_mensagem, ultima_mensagem_direcao, ultima_interacao_em, cliente_nome, kanban_status)
  VALUES (v_phone, v_phone, v_instance, v_fila, v_content, v_direction, NEW.created_at, v_cliente_nome, COALESCE(v_kanban_status, 'iniciou_conversa'))
  ON CONFLICT (document_key, whatsapp_instance) DO UPDATE SET
    ultima_mensagem        = v_content,
    ultima_mensagem_direcao = v_direction,
    ultima_interacao_em    = NEW.created_at,
    cliente_nome           = COALESCE(v_cliente_nome, crm_chat_conversations.cliente_nome),
    kanban_status          = CASE WHEN v_kanban_status IS NOT NULL THEN v_kanban_status ELSE crm_chat_conversations.kanban_status END,
    updated_at             = NOW()
  RETURNING id INTO v_conv_id;

  INSERT INTO crm_chat_messages (conversation_id, document_key, direction, sender_type, sender_name, mensagem, created_at)
  VALUES (v_conv_id, v_phone, v_direction, v_sender_type, v_sender_name, v_content, NEW.created_at)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para sync automático
DROP TRIGGER IF EXISTS trg_sync_communication_event ON communication_events;
CREATE TRIGGER trg_sync_communication_event
  AFTER INSERT ON communication_events
  FOR EACH ROW
  EXECUTE FUNCTION fn_sync_communication_event();

CREATE UNIQUE INDEX IF NOT EXISTS idx_conv_unique_doc_instance
  ON crm_chat_conversations (document_key, whatsapp_instance);

-- View administrativa do CRM Chat
DROP VIEW IF EXISTS crm_chat_admin_view;
CREATE OR REPLACE VIEW crm_chat_admin_view AS
SELECT
  c.id,
  c.document_key,
  c.telefone,
  c.cliente_nome,
  c.whatsapp_instance,
  c.numero_receptor,
  c.fila,
  c.kanban_status,
  c.atendimento_humano,
  c.agente_nome,
  c.ultima_mensagem,
  c.ultima_mensagem_direcao,
  c.ultima_interacao_em,
  c.created_at,
  c.crm_customer_id,
  cust.nome AS nome_crm,
  cust.email AS email_principal,
  cust.cpf,
  cust.cnpj,
  cust.observacoes,
  cust.contato_status,
  a.agent_id::text AS agente_atual,
  a.created_at::text AS agente_desde
FROM crm_chat_conversations c
LEFT JOIN crm_customers cust ON cust.id = c.crm_customer_id
LEFT JOIN LATERAL (
  SELECT agent_id, created_at
  FROM crm_chat_assignments
  WHERE conversation_id = c.id::text AND ativo = true
  ORDER BY created_at DESC
  LIMIT 1
) a ON true;
