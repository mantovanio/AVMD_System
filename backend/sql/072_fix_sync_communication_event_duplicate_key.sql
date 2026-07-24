CREATE OR REPLACE FUNCTION fn_sync_communication_event()
RETURNS TRIGGER AS $$
DECLARE
  v_phone         TEXT;
  v_instance      TEXT;
  v_conv_id       UUID;
  v_direction     TEXT;
  v_sender_type   TEXT;
  v_sender_name   TEXT;
  v_content       TEXT;
  v_is_from_me    BOOLEAN;
  v_kanban_status TEXT;
  v_cliente_nome  TEXT;
  v_is_email      BOOLEAN;
  v_fila          TEXT;
  v_mime_type     TEXT;
  v_file_name     TEXT;
  v_media_url     TEXT;
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

  v_is_from_me := COALESCE((NEW.payload->>'fromMe')::boolean, false);
  v_content   := COALESCE(NEW.payload->>'content', NEW.payload->>'body', '');
  v_direction := CASE WHEN v_is_from_me THEN 'outgoing' ELSE 'incoming' END;
  v_sender_type := CASE WHEN v_is_from_me THEN 'agent' ELSE 'contact' END;
  v_sender_name := CASE WHEN v_is_from_me THEN (NEW.payload->>'pushName') ELSE NULL END;
  v_kanban_status := NEW.payload->>'kanban_status';
  v_cliente_nome := COALESCE(NEW.payload->>'from_name', NEW.payload->>'pushName', NEW.payload->>'cliente_nome');
  v_mime_type := COALESCE(NEW.payload->>'mimeType', NEW.payload#>>'{message,mimetype}', NEW.payload->>'mime_type');
  v_file_name := COALESCE(NEW.payload->>'fileName', NEW.payload->>'filename', NEW.payload->>'title');
  v_media_url := COALESCE(NEW.payload->>'mediaUrl', NEW.payload->>'url', NEW.payload->>'link');

  SELECT c.id
    INTO v_conv_id
    FROM crm_chat_conversations c
   WHERE c.document_key = v_phone
     AND (
       NOT v_is_email
       OR COALESCE(c.whatsapp_instance, '') = COALESCE(v_instance, '')
     )
   ORDER BY c.updated_at DESC NULLS LAST, c.created_at DESC
   LIMIT 1;

  IF v_conv_id IS NOT NULL THEN
    UPDATE crm_chat_conversations
       SET ultima_mensagem = CASE WHEN v_content <> '' THEN v_content ELSE crm_chat_conversations.ultima_mensagem END,
           ultima_mensagem_direcao = CASE WHEN v_content <> '' THEN v_direction ELSE crm_chat_conversations.ultima_mensagem_direcao END,
           ultima_interacao_em = CASE WHEN v_content <> '' THEN NEW.created_at ELSE crm_chat_conversations.ultima_interacao_em END,
           cliente_nome = COALESCE(v_cliente_nome, crm_chat_conversations.cliente_nome),
           telefone = COALESCE(v_phone, crm_chat_conversations.telefone),
           whatsapp_instance = CASE
             WHEN NULLIF(v_instance, '') IS NOT NULL THEN v_instance
             ELSE crm_chat_conversations.whatsapp_instance
           END,
           fila = COALESCE(v_fila, crm_chat_conversations.fila),
           kanban_status = CASE
             WHEN v_kanban_status IS NOT NULL THEN v_kanban_status
             WHEN crm_chat_conversations.kanban_status = 'iniciou_conversa' AND v_content <> '' THEN 'conversando'
             ELSE crm_chat_conversations.kanban_status
           END,
           updated_at = NOW()
     WHERE id = v_conv_id;
  ELSE
    INSERT INTO crm_chat_conversations (
      document_key,
      telefone,
      whatsapp_instance,
      fila,
      ultima_mensagem,
      ultima_mensagem_direcao,
      ultima_interacao_em,
      cliente_nome,
      kanban_status
    )
    VALUES (
      v_phone,
      v_phone,
      NULLIF(v_instance, ''),
      COALESCE(v_fila, 'atendimento'),
      CASE WHEN v_content <> '' THEN v_content ELSE NULL END,
      CASE WHEN v_content <> '' THEN v_direction ELSE NULL END,
      CASE WHEN v_content <> '' THEN NEW.created_at ELSE NULL END,
      v_cliente_nome,
      COALESCE(v_kanban_status, 'iniciou_conversa')
    )
    ON CONFLICT (document_key) WHERE document_key ~ '^[0-9]+$'
    DO UPDATE SET
      ultima_mensagem = EXCLUDED.ultima_mensagem,
      ultima_mensagem_direcao = EXCLUDED.ultima_mensagem_direcao,
      ultima_interacao_em = EXCLUDED.ultima_interacao_em,
      cliente_nome = COALESCE(EXCLUDED.cliente_nome, crm_chat_conversations.cliente_nome),
      telefone = COALESCE(EXCLUDED.telefone, crm_chat_conversations.telefone),
      whatsapp_instance = COALESCE(EXCLUDED.whatsapp_instance, crm_chat_conversations.whatsapp_instance),
      fila = COALESCE(EXCLUDED.fila, crm_chat_conversations.fila),
      kanban_status = CASE
        WHEN EXCLUDED.kanban_status IS NOT NULL THEN EXCLUDED.kanban_status
        WHEN crm_chat_conversations.kanban_status = 'iniciou_conversa' AND EXCLUDED.ultima_mensagem IS NOT NULL THEN 'conversando'
        ELSE crm_chat_conversations.kanban_status
      END,
      updated_at = NOW()
    RETURNING id INTO v_conv_id;
  END IF;

  IF v_content <> '' OR NULLIF(v_mime_type, '') IS NOT NULL OR NULLIF(v_media_url, '') IS NOT NULL THEN
    INSERT INTO crm_chat_messages (
      conversation_id,
      document_key,
      direction,
      sender_type,
      sender_name,
      mensagem,
      mime_type,
      file_name,
      media_url,
      created_at
    )
    VALUES (
      v_conv_id,
      v_phone,
      v_direction,
      v_sender_type,
      v_sender_name,
      v_content,
      NULLIF(v_mime_type, ''),
      NULLIF(v_file_name, ''),
      NULLIF(v_media_url, ''),
      NEW.created_at
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
