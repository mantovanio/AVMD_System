-- 056_fix_trigger_media_metadata.sql
-- Atualiza fn_sync_communication_event para salvar mime_type, file_name, media_url
-- nas mensagens do chat quando recebidas com anexo/imagem/arquivo

CREATE OR REPLACE FUNCTION fn_sync_communication_event()
RETURNS TRIGGER AS $$
DECLARE
  v_phone              TEXT;
  v_instance           TEXT;
  v_kanban_status      TEXT;
  v_cliente_nome       TEXT;
  v_existing_nome      TEXT;
  v_existing_document_key TEXT;
  v_existing_fila      TEXT;
  v_existing_instance  TEXT;
  v_existing_telefone  TEXT;
  v_is_email           BOOLEAN;
  v_fila               TEXT;
  v_subject            TEXT;
  v_canal              TEXT;
  v_telefone           TEXT;
  v_email              TEXT;
  v_documento          TEXT;
  v_customer_id        UUID;
  v_customer_phone     TEXT;
  v_body               TEXT;
  v_body_phone         TEXT;
  v_body_document      TEXT;
  v_external_message_id TEXT;
  v_receipt_status     TEXT;
  v_conv_id            UUID;
  v_content            TEXT;
  v_direction          TEXT;
  v_sender_type        TEXT;
  v_sender_name        TEXT;
  v_has_content        BOOLEAN;
  v_mime_type          TEXT;
  v_file_name          TEXT;
  v_media_url          TEXT;
BEGIN
  v_phone := COALESCE(
    NEW.payload->>'from',
    NEW.payload->>'remoteJid',
    NEW.payload->>'conversationId',
    NEW.payload->>'documentKey',
    ''
  );
  v_instance := COALESCE(NEW.payload->>'instance_name', NEW.payload->>'instanceName', '');

  v_kanban_status := NEW.payload->>'kanban_status';
  v_canal := NEW.payload->>'canal';
  v_body := COALESCE(NEW.payload->>'body', NEW.payload->>'content', '');
  v_external_message_id := COALESCE(
    NULLIF(NEW.external_id, ''),
    NULLIF(NEW.payload->>'messageId', ''),
    NULLIF(NEW.payload->>'externalId', ''),
    NULLIF(NEW.payload#>>'{data,key,id}', ''),
    NULLIF(NEW.payload#>>'{data,id}', ''),
    NULLIF(NEW.payload#>>'{key,id}', '')
  );

  -- extrair metadata de media do payload
  v_mime_type := COALESCE(NEW.payload->>'mimeType', NEW.payload#>>'{message,mimetype}', '');
  v_file_name := COALESCE(NEW.payload->>'fileName', NEW.payload->>'title', '');
  v_media_url := COALESCE(NEW.payload->>'mediaUrl', '');

  IF NEW.source = 'evolution' AND NEW.event_type = 'messages.update' THEN
    v_receipt_status := LOWER(COALESCE(
      NULLIF(NEW.payload->>'status', ''),
      NULLIF(NEW.payload#>>'{data,status}', ''),
      NULLIF(NEW.payload#>>'{data,messageStatus}', ''),
      NULLIF(NEW.payload#>>'{data,update,status}', ''),
      NULLIF(NEW.payload#>>'{message,status}', ''),
      NULLIF(NEW.payload#>>'{data,key,status}', ''),
      ''
    ));

    IF v_receipt_status <> '' AND v_external_message_id IS NOT NULL THEN
      UPDATE crm_chat_messages
         SET delivery_status = CASE
               WHEN v_receipt_status LIKE '%read%' OR v_receipt_status LIKE '%played%' THEN 'read'
               WHEN v_receipt_status LIKE '%deliver%' OR v_receipt_status LIKE '%server_ack%' OR v_receipt_status LIKE '%receipt%' THEN 'delivered'
               WHEN v_receipt_status LIKE '%error%' OR v_receipt_status LIKE '%fail%' THEN 'failed'
               WHEN v_receipt_status LIKE '%sent%' OR v_receipt_status LIKE '%ack%' OR v_receipt_status LIKE '%pending%' THEN 'sent'
               ELSE delivery_status
             END,
             delivered_at = CASE
               WHEN (v_receipt_status LIKE '%deliver%' OR v_receipt_status LIKE '%server_ack%' OR v_receipt_status LIKE '%receipt%' OR v_receipt_status LIKE '%read%' OR v_receipt_status LIKE '%played%')
                    AND delivered_at IS NULL THEN NEW.created_at
               ELSE delivered_at
             END,
             read_at = CASE
               WHEN (v_receipt_status LIKE '%read%' OR v_receipt_status LIKE '%played%')
                    AND read_at IS NULL THEN NEW.created_at
               ELSE read_at
             END,
             status_updated_at = NEW.created_at
       WHERE external_message_id = v_external_message_id;
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.conversation_id IS NOT NULL
     AND NEW.conversation_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    SELECT c.id, c.document_key, c.cliente_nome, c.fila, c.whatsapp_instance, c.telefone
      INTO v_conv_id, v_existing_document_key, v_existing_nome, v_existing_fila, v_existing_instance, v_existing_telefone
      FROM crm_chat_conversations c
     WHERE c.id::text = NEW.conversation_id
     LIMIT 1;

    IF v_conv_id IS NOT NULL THEN
      IF COALESCE(v_phone, '') = '' OR v_phone = NEW.conversation_id THEN
        v_phone := COALESCE(v_existing_document_key, v_phone);
      END IF;
      IF COALESCE(v_instance, '') = '' THEN
        v_instance := COALESCE(v_existing_instance, '');
      END IF;
    END IF;
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

  IF v_is_email AND v_phone LIKE '%@%' AND v_instance = '' THEN
    v_instance := split_part(v_phone, '@', 2);
  END IF;

  IF NEW.conversation_id IS NOT NULL
     AND NEW.conversation_id <> ''
     AND NOT (NEW.conversation_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  THEN
    v_phone := NEW.conversation_id;
  END IF;

  v_email := COALESCE(NEW.payload->>'customer_email', NEW.payload->>'email', '');
  v_telefone := regexp_replace(COALESCE(NEW.payload->>'telefone', NEW.payload->>'documentKey', ''), '[^0-9]', '', 'g');
  v_documento := regexp_replace(COALESCE(NEW.payload->>'customer_document', ''), '[^0-9]', '', 'g');

  v_is_from_me := (NEW.payload->>'fromMe')::boolean;
  v_content := COALESCE(NEW.payload->>'content', NEW.payload->>'body', '');
  v_has_content := (v_content <> '' OR v_mime_type <> '' OR v_media_url <> '');

  IF v_is_email AND v_body <> '' THEN
    v_body_phone := regexp_replace(
      COALESCE(substring(v_body FROM 'Telefone:\s*([0-9() \-]+)'), ''),
      '[^0-9]',
      '',
      'g'
    );
    IF v_body_phone <> '' AND length(v_body_phone) BETWEEN 10 AND 11 THEN
      v_body_phone := '55' || v_body_phone;
    END IF;

    v_body_document := regexp_replace(
      COALESCE(substring(v_body FROM '(?:CPF/CNPJ|CNPJ/CPF):\s*([0-9./-]+)'), ''),
      '[^0-9]',
      '',
      'g'
    );

    IF v_telefone = '' AND v_body_phone <> '' THEN
      v_telefone := v_body_phone;
    END IF;
    IF v_documento = '' AND v_body_document <> '' THEN
      v_documento := v_body_document;
    END IF;
  END IF;

  IF v_customer_id IS NULL
     AND (v_email <> '' OR v_telefone <> '' OR v_documento <> '' OR (v_is_email AND v_phone LIKE '%@%'))
  THEN
    SELECT c.id, regexp_replace(COALESCE(c.telefone, ''), '[^0-9]', '', 'g')
      INTO v_customer_id, v_customer_phone
      FROM crm_customers c
     WHERE (v_email <> '' AND LOWER(COALESCE(c.email, '')) = LOWER(v_email))
        OR (v_telefone <> '' AND fn_normalize_phone_br(c.telefone) = fn_normalize_phone_br(v_telefone))
        OR (v_documento <> '' AND regexp_replace(COALESCE(c.cpf, ''), '[^0-9]', '', 'g') = v_documento)
        OR (v_documento <> '' AND regexp_replace(COALESCE(c.cnpj, ''), '[^0-9]', '', 'g') = v_documento)
     ORDER BY c.updated_at DESC
     LIMIT 1;
  END IF;

  IF v_customer_id IS NOT NULL AND v_customer_phone IS NOT NULL AND v_customer_phone <> '' THEN
    v_phone := v_customer_phone;
  ELSIF v_is_email AND v_telefone <> '' THEN
    v_phone := v_telefone;
  ELSIF NOT v_is_email AND v_telefone = '' AND COALESCE(v_existing_telefone, '') <> '' THEN
    v_telefone := regexp_replace(v_existing_telefone, '[^0-9]', '', 'g');
    v_phone := v_telefone;
  END IF;

  IF NOT v_is_email THEN
    v_phone := fn_normalize_phone_br(v_phone);
    IF v_phone IS NULL THEN
      IF v_conv_id IS NOT NULL AND COALESCE(v_existing_document_key, '') <> '' THEN
        v_phone := v_existing_document_key;
        v_is_email := v_phone LIKE '%@%';
      ELSE
        RETURN NEW;
      END IF;
    END IF;
  END IF;

  v_telefone := CASE WHEN v_is_email THEN NULLIF(v_telefone, '') ELSE v_phone END;

  v_fila := CASE
    WHEN v_canal IS NOT NULL AND v_canal <> '' THEN v_canal
    WHEN v_existing_fila IS NOT NULL AND v_existing_fila <> '' THEN v_existing_fila
    WHEN v_is_email THEN 'email'
    ELSE 'atendimento'
  END;

  v_direction := CASE WHEN v_is_from_me THEN 'outgoing' ELSE 'incoming' END;
  v_sender_type := CASE WHEN v_is_from_me THEN 'agent' ELSE 'customer' END;
  v_sender_name := COALESCE(NEW.payload->>'pushName', '');

  v_cliente_nome := COALESCE(
    NULLIF(TRIM(NEW.payload->>'customer_name'), ''),
    NULLIF(v_existing_nome, ''),
    NULLIF(v_sender_name, '')
  );

  SELECT id INTO v_conv_id
    FROM crm_chat_conversations
   WHERE document_key = v_phone
     AND whatsapp_instance IS NOT DISTINCT FROM NULLIF(v_instance, '')
   ORDER BY updated_at DESC
   LIMIT 1;

  IF v_conv_id IS NULL THEN
    INSERT INTO crm_chat_conversations (
      document_key, whatsapp_instance, telefone, fila,
      ultima_mensagem, ultima_direcao, ultima_mensagem_em,
      cliente_nome, status, customer_id
    )
    VALUES (
      v_phone,
      NULLIF(v_instance, ''),
      v_telefone,
      COALESCE(v_fila, 'atendimento'),
      CASE WHEN v_has_content THEN v_content ELSE NULL END,
      CASE WHEN v_has_content THEN v_direction ELSE NULL END,
      CASE WHEN v_has_content THEN NEW.created_at ELSE NULL END,
      v_cliente_nome,
      COALESCE(v_kanban_status, 'iniciou_conversa'),
      v_customer_id
    )
    RETURNING id INTO v_conv_id;
  END IF;

  IF v_has_content THEN
    INSERT INTO crm_chat_messages (
      conversation_id,
      document_key,
      external_message_id,
      direction,
      sender_type,
      sender_name,
      mensagem,
      mime_type,
      file_name,
      media_url,
      delivery_status,
      delivered_at,
      read_at,
      status_updated_at,
      created_at
    )
    VALUES (
      v_conv_id,
      v_phone,
      v_external_message_id,
      v_direction,
      v_sender_type,
      v_sender_name,
      v_content,
      NULLIF(v_mime_type, ''),
      NULLIF(v_file_name, ''),
      NULLIF(v_media_url, ''),
      CASE WHEN v_direction = 'outgoing' THEN 'sent' ELSE 'received' END,
      CASE WHEN v_direction = 'incoming' THEN NEW.created_at ELSE NULL END,
      NULL,
      NEW.created_at,
      NEW.created_at
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
