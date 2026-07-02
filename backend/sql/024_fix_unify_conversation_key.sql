-- Unifica chave da conversa por cliente em vez de usar email como document_key
-- Motivo: mesmo cliente aparece 2x no Inbox (uma com chave de email, outra com chave de telefone)
-- 
-- Mudancas:
-- 1. conversation_id (pre-resolvido pela aplicacao) agora tem prioridade sobre payload->>'from'
-- 2. Tenta encontrar crm_customer por email/telefone/documento do payload
-- 3. Se encontrar customer com telefone, usa o telefone como document_key (unifica)
-- 4. Vincula crm_customer_id na conversa para rastreabilidade

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
  v_subject       TEXT;
  v_canal         TEXT;
  v_telefone      TEXT;
  v_email         TEXT;
  v_documento     TEXT;
  v_customer_id   UUID;
  v_customer_phone TEXT;
BEGIN
  v_phone     := COALESCE(NEW.payload->>'from', NEW.payload->>'remoteJid', '');
  v_instance  := COALESCE(NEW.payload->>'instance_name', NEW.payload->>'instanceName', '');
  v_kanban_status := NEW.payload->>'kanban_status';
  v_canal     := NEW.payload->>'canal';

  -- Determina se eh email ANTES de potencialmente sobrescrever v_phone com conversation_id
  v_is_email := (NEW.source = 'email') OR (
    NEW.source IS DISTINCT FROM 'evolution'
    AND v_phone LIKE '%@%'
    AND v_phone NOT LIKE '%@s.whatsapp.net'
    AND v_phone NOT LIKE '%@g.us'
    AND v_phone NOT LIKE '%@broadcast%'
    AND v_phone NOT LIKE '%@lid'
    AND v_phone NOT LIKE '%@hosted.lid'
  );

  -- Para eventos de email, extrai instance do dominio ANTES de sobrescrever v_phone
  IF v_is_email AND v_phone LIKE '%@%' AND v_instance = '' THEN
    v_instance := split_part(v_phone, '@', 2);
  END IF;

  -- conversation_id (pre-resolvido pela aplicacao como phoneDigits) tem prioridade
  IF NEW.conversation_id IS NOT NULL AND NEW.conversation_id <> '' THEN
    v_phone := NEW.conversation_id;
  END IF;

  IF v_phone IS NULL OR v_phone = '' THEN
    RETURN NEW;
  END IF;

  -- Ignora eventos evolution sem conteudo real
  IF NEW.source = 'evolution' AND NEW.event_type IN ('messages.update', 'messages.delete', 'presence.update', 'connection.update') THEN
    RETURN NEW;
  END IF;

  v_fila := CASE
    WHEN v_is_email AND v_kanban_status IN ('agendado', 'cancelou_agendamento') THEN 'agendamento'
    WHEN v_is_email THEN 'email'
    WHEN v_canal = 'renovacao' OR LOWER(v_instance) LIKE '%renov%' THEN 'renovacao'
    ELSE 'atendimento'
  END;
  v_subject := NEW.payload->>'subject';

  -- Extrai identificadores adicionais do payload para buscar customer
  v_email     := COALESCE(NEW.payload->>'customer_email', '');
  v_telefone  := regexp_replace(COALESCE(NEW.payload->>'telefone', ''), '[^0-9]', '', 'g');
  v_documento := regexp_replace(COALESCE(NEW.payload->>'customer_document', ''), '[^0-9]', '', 'g');

  -- Tenta encontrar customer existente por qualquer identificador disponivel
  IF v_customer_id IS NULL AND
     (v_email <> '' OR v_telefone <> '' OR v_documento <> '' OR (v_is_email AND v_phone LIKE '%@%'))
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

  -- Se encontrou customer com telefone, usa o telefone como document_key para unificar
  IF v_customer_id IS NOT NULL AND v_customer_phone IS NOT NULL AND v_customer_phone <> '' THEN
    v_phone := v_customer_phone;
  END IF;

  -- Formata v_phone e valida para canais nao-email
  IF NOT v_is_email THEN
    v_phone := regexp_replace(v_phone, '[^0-9]', '', 'g');
    IF LENGTH(v_phone) < 10 OR LENGTH(v_phone) > 15 THEN
      RETURN NEW;
    END IF;
  END IF;

  -- telefone para a coluna: se for email usa o campo do payload (se existir), senao usa o v_phone limpo
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
    CASE WHEN v_is_email THEN split_part(v_phone, '@', 1) ELSE NULL END
  );

  INSERT INTO crm_chat_conversations (document_key, telefone, whatsapp_instance, fila, ultima_mensagem, ultima_mensagem_direcao, ultima_interacao_em, cliente_nome, kanban_status, crm_customer_id)
  VALUES (v_phone, v_telefone, v_instance, v_fila, v_content, v_direction, NEW.created_at, v_cliente_nome, COALESCE(v_kanban_status, 'iniciou_conversa'), v_customer_id)
  ON CONFLICT (document_key, whatsapp_instance) DO UPDATE SET
    ultima_mensagem        = v_content,
    ultima_mensagem_direcao = v_direction,
    ultima_interacao_em    = NEW.created_at,
    cliente_nome           = COALESCE(v_cliente_nome, crm_chat_conversations.cliente_nome),
    kanban_status          = CASE WHEN v_kanban_status IS NOT NULL THEN v_kanban_status ELSE crm_chat_conversations.kanban_status END,
    crm_customer_id        = COALESCE(v_customer_id, crm_chat_conversations.crm_customer_id),
    updated_at             = NOW()
  RETURNING id INTO v_conv_id;

  INSERT INTO crm_chat_messages (conversation_id, document_key, direction, sender_type, sender_name, mensagem, created_at)
  VALUES (v_conv_id, v_phone, v_direction, v_sender_type, v_sender_name, v_content, NEW.created_at)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
