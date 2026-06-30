-- Separa emails de agendamento (kanban_status='agendado') em fila propria

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
BEGIN
  v_phone     := COALESCE(NEW.payload->>'from', NEW.payload->>'remoteJid', '');
  v_instance  := COALESCE(NEW.payload->>'instance_name', '');
  v_kanban_status := NEW.payload->>'kanban_status';

  IF v_phone = '' AND NEW.conversation_id IS NOT NULL AND NEW.conversation_id <> '' THEN
    v_phone := NEW.conversation_id;
  END IF;

  IF v_phone IS NULL OR v_phone = '' THEN
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
    ELSE 'geral'
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
    CASE WHEN v_is_email THEN split_part(v_phone, '@', 1) ELSE NULL END
  );

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

-- Corrigir conversas existentes: emails de agendamento vao para fila 'agendamento'
UPDATE crm_chat_conversations
SET fila = 'agendamento', updated_at = NOW()
WHERE fila = 'email'
  AND kanban_status IN ('agendado', 'cancelou_agendamento');
