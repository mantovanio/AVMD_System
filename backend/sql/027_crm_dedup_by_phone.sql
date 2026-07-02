-- Deduplica conversas WhatsApp por numero de telefone:
-- mesmo numero = mesma conversa, independente da instancia.
-- Usa o telefone como fallback do nome do cliente.

-- 1) Atualizar trigger: buscar conversa existente por telefone primeiro
DROP FUNCTION IF EXISTS fn_sync_communication_event() CASCADE;

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
  v_subject     TEXT;
  v_canal       TEXT;
  v_telefone    TEXT;
BEGIN
  v_phone     := COALESCE(NEW.payload->>'from', NEW.payload->>'remoteJid', '');
  v_instance  := COALESCE(NEW.payload->>'instance_name', NEW.payload->>'instanceName', '');
  v_kanban_status := NEW.payload->>'kanban_status';
  v_canal     := NEW.payload->>'canal';

  IF v_phone = '' AND NEW.conversation_id IS NOT NULL AND NEW.conversation_id <> '' THEN
    v_phone := NEW.conversation_id;
  END IF;

  IF v_phone IS NULL OR v_phone = '' THEN
    RETURN NEW;
  END IF;

  IF NEW.source = 'evolution' AND NEW.event_type IN ('messages.update', 'messages.delete', 'presence.update', 'connection.update') THEN
    RETURN NEW;
  END IF;

  v_is_email := (NEW.source = 'email') OR (
    NEW.source IS DISTINCT FROM 'evolution'
    AND v_phone LIKE '%@%'
    AND v_phone NOT LIKE '%@s.whatsapp.net'
    AND v_phone NOT LIKE '%@g.us'
    AND v_phone NOT LIKE '%@broadcast%'
    AND v_phone NOT LIKE '%@lid'
    AND v_phone NOT LIKE '%@hosted.lid'
  );

  v_fila     := CASE
    WHEN v_is_email AND v_kanban_status IN ('agendado', 'cancelou_agendamento') THEN 'agendamento'
    WHEN v_is_email THEN 'email'
    WHEN v_canal = 'renovacao' OR LOWER(v_instance) LIKE '%renov%' THEN 'renovacao'
    ELSE 'atendimento'
  END;
  v_subject  := NEW.payload->>'subject';

  IF v_is_email THEN
    v_instance := COALESCE(v_instance, split_part(v_phone, '@', 2));
  ELSE
    v_phone := regexp_replace(v_phone, '[^0-9]', '', 'g');
    IF length(v_phone) < 10 OR length(v_phone) > 15 THEN
      RETURN NEW;
    END IF;
  END IF;

  v_telefone := CASE WHEN v_is_email THEN NULLIF(NEW.payload->>'telefone', '') ELSE v_phone END;

  v_is_from_me := (NEW.payload->>'fromMe')::boolean;
  v_content   := COALESCE(NEW.payload->>'content', NEW.payload->>'body', '');
  v_direction   := CASE WHEN v_is_from_me THEN 'outgoing' ELSE 'incoming' END;
  v_sender_type := CASE WHEN v_is_from_me THEN 'agent' ELSE 'contact' END;
  v_sender_name := COALESCE(
    NEW.payload->>'sender_name',
    NEW.payload->>'from_name',
    NEW.payload->>'pushName',
    CASE WHEN v_is_email THEN v_subject ELSE NULL END
  );
  v_cliente_nome := COALESCE(
    NEW.payload->>'from_name',
    NEW.payload->>'cliente_nome',
    NEW.payload->>'sender_name',
    NEW.payload->>'pushName',
    CASE WHEN v_is_email THEN v_subject ELSE NULL END,
    CASE WHEN v_is_email THEN split_part(v_phone, '@', 1) ELSE NULL END,
    v_phone
  );

  -- Buscar conversa existente pelo telefone (dedup entre instancias)
  SELECT id INTO v_conv_id
  FROM crm_chat_conversations
  WHERE document_key = v_phone
  LIMIT 1;

  IF v_conv_id IS NOT NULL THEN
    UPDATE crm_chat_conversations SET
      ultima_mensagem        = v_content,
      ultima_mensagem_direcao = v_direction,
      ultima_interacao_em    = NEW.created_at,
      cliente_nome           = COALESCE(v_cliente_nome, crm_chat_conversations.cliente_nome),
      kanban_status          = CASE WHEN v_kanban_status IS NOT NULL THEN v_kanban_status ELSE crm_chat_conversations.kanban_status END,
      updated_at             = NOW()
    WHERE id = v_conv_id;
  ELSE
    INSERT INTO crm_chat_conversations (document_key, telefone, whatsapp_instance, fila, ultima_mensagem, ultima_mensagem_direcao, ultima_interacao_em, cliente_nome, kanban_status)
    VALUES (v_phone, v_telefone, v_instance, v_fila, v_content, v_direction, NEW.created_at, v_cliente_nome, COALESCE(v_kanban_status, 'iniciou_conversa'))
    RETURNING id INTO v_conv_id;
  END IF;

  INSERT INTO crm_chat_messages (conversation_id, document_key, direction, sender_type, sender_name, mensagem, created_at)
  VALUES (v_conv_id, v_phone, v_direction, v_sender_type, v_sender_name, v_content, NEW.created_at)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recriar trigger
DROP TRIGGER IF EXISTS trg_sync_communication_event ON communication_events;
CREATE TRIGGER trg_sync_communication_event
  AFTER INSERT ON communication_events
  FOR EACH ROW
  EXECUTE FUNCTION fn_sync_communication_event();

-- 2) Merge conversas WhatsApp existentes com mesmo numero (instancias diferentes)
-- Primeiro: mover todas as mensagens das conversas duplicadas para a melhor conversa
WITH ranked AS (
  SELECT id,
         FIRST_VALUE(id) OVER (
           PARTITION BY document_key
           ORDER BY ultima_interacao_em DESC NULLS LAST, created_at DESC
         ) AS best_id
  FROM crm_chat_conversations
  WHERE document_key ~ '^[0-9]+$'
)
UPDATE crm_chat_messages m
SET conversation_id = r.best_id
FROM ranked r
WHERE m.conversation_id = r.id
  AND r.id != r.best_id;

-- Depois: remover as conversas duplicatas (agora sem mensagens)
DELETE FROM crm_chat_conversations
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY document_key
             ORDER BY ultima_interacao_em DESC NULLS LAST, created_at DESC
           ) AS rn
    FROM crm_chat_conversations
    WHERE document_key ~ '^[0-9]+$'
  ) sub
  WHERE sub.rn > 1
);

-- 3) Unique index apenas por telefone (WhatsApp numerico)
DROP INDEX IF EXISTS idx_conv_unique_doc_instance;
CREATE UNIQUE INDEX IF NOT EXISTS idx_conv_document_key_unique
  ON crm_chat_conversations (document_key)
  WHERE document_key ~ '^[0-9]+$';
