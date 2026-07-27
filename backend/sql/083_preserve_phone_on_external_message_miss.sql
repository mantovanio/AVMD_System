-- A busca por external_message_id nao pode sobrescrever v_phone com NULL
-- quando ainda nao existe uma mensagem local com esse identificador.
DO $migration$
DECLARE
  function_definition text;
  old_fragment text;
  new_fragment text;
BEGIN
  SELECT pg_get_functiondef('fn_sync_communication_event()'::regprocedure)
    INTO function_definition;

  IF function_definition LIKE '%-- preserve_phone_on_external_miss_v1%' THEN
    RETURN;
  END IF;

  old_fragment := $old$
  IF NULLIF(v_external_message_id, '') IS NOT NULL THEN
    SELECT c.id, c.document_key, c.telefone
      INTO v_conv_id, v_phone, v_telefone
      FROM crm_chat_messages m
      JOIN crm_chat_conversations c ON c.id = m.conversation_id
     WHERE m.external_message_id = v_external_message_id
     ORDER BY m.created_at ASC
     LIMIT 1;
  END IF;
$old$;

  new_fragment := $new$
  -- preserve_phone_on_external_miss_v1
  IF NULLIF(v_external_message_id, '') IS NOT NULL THEN
    SELECT c.id, c.document_key, c.telefone
      INTO v_conv_id, v_existing_document_key, v_existing_telefone
      FROM crm_chat_messages m
      JOIN crm_chat_conversations c ON c.id = m.conversation_id
     WHERE m.external_message_id = v_external_message_id
     ORDER BY m.created_at ASC
     LIMIT 1;

    IF v_conv_id IS NOT NULL THEN
      v_phone := COALESCE(v_existing_document_key, v_phone);
      v_telefone := COALESCE(v_existing_telefone, v_telefone);
    END IF;
  END IF;
$new$;

  IF strpos(function_definition, old_fragment) = 0 THEN
    RAISE EXCEPTION 'Busca por mensagem externa nao localizada.';
  END IF;

  EXECUTE replace(function_definition, old_fragment, new_fragment);
END;
$migration$;
