-- Adiciona status por mensagem no CRM chat e reforca a classificacao de renovacao
-- para disparos outbound feitos pela tela de Renovações.

ALTER TABLE crm_chat_messages
  ADD COLUMN IF NOT EXISTS delivery_status TEXT,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_crm_chat_messages_external_message_id
  ON crm_chat_messages (external_message_id);

UPDATE crm_chat_messages
   SET delivery_status = CASE
     WHEN direction = 'outgoing' THEN 'sent'
     ELSE 'received'
   END,
       delivered_at = CASE
         WHEN direction = 'incoming' AND delivered_at IS NULL THEN created_at
         ELSE delivered_at
       END,
       status_updated_at = COALESCE(status_updated_at, created_at)
 WHERE delivery_status IS NULL;

CREATE OR REPLACE FUNCTION fn_sync_communication_event()
RETURNS TRIGGER AS $$
DECLARE
  v_phone             TEXT;
  v_instance          TEXT;
  v_conv_id           UUID;
  v_direction         TEXT;
  v_sender_type       TEXT;
  v_sender_name       TEXT;
  v_content           TEXT;
  v_is_from_me        BOOLEAN;
  v_kanban_status     TEXT;
  v_cliente_nome      TEXT;
  v_is_email          BOOLEAN;
  v_fila              TEXT;
  v_subject           TEXT;
  v_canal             TEXT;
  v_telefone          TEXT;
  v_email             TEXT;
  v_documento         TEXT;
  v_customer_id       UUID;
  v_customer_phone    TEXT;
  v_body              TEXT;
  v_body_phone        TEXT;
  v_body_document     TEXT;
  v_external_message_id TEXT;
  v_receipt_status    TEXT;
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

  IF NEW.conversation_id IS NOT NULL AND NEW.conversation_id <> '' THEN
    v_phone := NEW.conversation_id;
  END IF;

  IF v_phone IS NULL OR v_phone = '' THEN
    RETURN NEW;
  END IF;

  IF NEW.source = 'evolution' AND NEW.event_type IN ('messages.delete', 'presence.update', 'connection.update') THEN
    RETURN NEW;
  END IF;

  v_fila := CASE
    WHEN v_is_email AND v_kanban_status IN ('agendado', 'cancelou_agendamento') THEN 'agendamento'
    WHEN v_is_email THEN 'email'
    WHEN v_canal = 'renovacao' OR LOWER(v_instance) LIKE '%renov%' OR LOWER(v_instance) LIKE '%certiid%' THEN 'renovacao'
    ELSE 'atendimento'
  END;
  v_subject := NEW.payload->>'subject';

  v_email := COALESCE(NEW.payload->>'customer_email', '');
  v_telefone := regexp_replace(COALESCE(NEW.payload->>'telefone', NEW.payload->>'documentKey', ''), '[^0-9]', '', 'g');
  v_documento := regexp_replace(COALESCE(NEW.payload->>'customer_document', ''), '[^0-9]', '', 'g');

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
        OR (v_telefone <> '' AND regexp_replace(COALESCE(c.telefone, ''), '[^0-9]', '', 'g') = v_telefone)
        OR (v_documento <> '' AND regexp_replace(COALESCE(c.cpf, ''), '[^0-9]', '', 'g') = v_documento)
        OR (v_documento <> '' AND regexp_replace(COALESCE(c.cnpj, ''), '[^0-9]', '', 'g') = v_documento)
     ORDER BY c.updated_at DESC
     LIMIT 1;
  END IF;

  IF v_customer_id IS NOT NULL AND v_customer_phone IS NOT NULL AND v_customer_phone <> '' THEN
    v_phone := v_customer_phone;
  ELSIF v_is_email AND v_telefone <> '' THEN
    v_phone := v_telefone;
  END IF;

  IF NOT v_is_email THEN
    v_phone := regexp_replace(v_phone, '[^0-9]', '', 'g');
    IF LENGTH(v_phone) < 10 OR LENGTH(v_phone) > 15 THEN
      RETURN NEW;
    END IF;
  END IF;

  v_telefone := CASE WHEN v_is_email THEN NULLIF(v_telefone, '') ELSE v_phone END;

  v_is_from_me := (NEW.payload->>'fromMe')::boolean;
  v_content := COALESCE(NEW.payload->>'content', NEW.payload->>'body', '');
  v_direction := CASE WHEN v_is_from_me THEN 'outgoing' ELSE 'incoming' END;
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
       SET ultima_mensagem = v_content,
           ultima_mensagem_direcao = v_direction,
           ultima_interacao_em = NEW.created_at,
           cliente_nome = COALESCE(v_cliente_nome, crm_chat_conversations.cliente_nome),
           telefone = COALESCE(v_telefone, crm_chat_conversations.telefone),
           whatsapp_instance = COALESCE(NULLIF(v_instance, ''), crm_chat_conversations.whatsapp_instance),
           fila = COALESCE(v_fila, crm_chat_conversations.fila),
           kanban_status = CASE
             WHEN v_kanban_status IS NOT NULL THEN v_kanban_status
             WHEN crm_chat_conversations.kanban_status = 'iniciou_conversa' THEN 'conversando'
             ELSE crm_chat_conversations.kanban_status
           END,
           crm_customer_id = COALESCE(v_customer_id, crm_chat_conversations.crm_customer_id),
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
      kanban_status,
      crm_customer_id
    )
    VALUES (
      v_phone,
      v_telefone,
      v_instance,
      v_fila,
      v_content,
      v_direction,
      NEW.created_at,
      v_cliente_nome,
      COALESCE(v_kanban_status, 'iniciou_conversa'),
      v_customer_id
    )
    RETURNING id INTO v_conv_id;
  END IF;

  INSERT INTO crm_chat_messages (
    conversation_id,
    document_key,
    external_message_id,
    direction,
    sender_type,
    sender_name,
    mensagem,
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
    CASE WHEN v_direction = 'outgoing' THEN 'sent' ELSE 'received' END,
    CASE WHEN v_direction = 'incoming' THEN NEW.created_at ELSE NULL END,
    NULL,
    NEW.created_at,
    NEW.created_at
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

UPDATE crm_chat_conversations c
   SET fila = 'renovacao',
       whatsapp_instance = COALESCE(
         NULLIF((
           SELECT COALESCE(ce.payload->>'instance_name', ce.payload->>'instanceName')
             FROM communication_events ce
            WHERE (
                    ce.conversation_id = c.document_key
                 OR ce.conversation_id = c.document_key || '@s.whatsapp.net'
                 OR regexp_replace(COALESCE(ce.payload->>'documentKey', ce.contact, ''), '[^0-9]', '', 'g')
                    = regexp_replace(COALESCE(c.telefone, c.document_key, ''), '[^0-9]', '', 'g')
                  )
              AND (
                    ce.payload->>'canal' = 'renovacao'
                 OR LOWER(COALESCE(ce.payload->>'instance_name', ce.payload->>'instanceName', '')) LIKE '%renov%'
                 OR LOWER(COALESCE(ce.payload->>'instance_name', ce.payload->>'instanceName', '')) LIKE '%certiid%'
                  )
            ORDER BY ce.created_at DESC
            LIMIT 1
         ), ''),
         c.whatsapp_instance
       ),
       updated_at = NOW()
 WHERE EXISTS (
   SELECT 1
     FROM communication_events ce
    WHERE (
            ce.conversation_id = c.document_key
         OR ce.conversation_id = c.document_key || '@s.whatsapp.net'
         OR regexp_replace(COALESCE(ce.payload->>'documentKey', ce.contact, ''), '[^0-9]', '', 'g')
            = regexp_replace(COALESCE(c.telefone, c.document_key, ''), '[^0-9]', '', 'g')
          )
      AND (
            ce.payload->>'canal' = 'renovacao'
         OR LOWER(COALESCE(ce.payload->>'instance_name', ce.payload->>'instanceName', '')) LIKE '%renov%'
         OR LOWER(COALESCE(ce.payload->>'instance_name', ce.payload->>'instanceName', '')) LIKE '%certiid%'
          )
 );
