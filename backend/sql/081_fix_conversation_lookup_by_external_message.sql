-- Um envio local e o eco do provedor podem trazer telefones com formatos
-- diferentes. O identificador externo da mensagem deve prevalecer para
-- localizar a conversa já existente.
DO $migration$
DECLARE
  function_definition text;
  old_fragment text;
  new_fragment text;
BEGIN
  SELECT pg_get_functiondef('fn_sync_communication_event()'::regprocedure)
    INTO function_definition;

  IF function_definition LIKE '%-- external_message_conversation_lookup_v1%' THEN
    RETURN;
  END IF;

  old_fragment := $old$
  -- normalized_conversation_lookup_v1
  SELECT id INTO v_conv_id
    FROM crm_chat_conversations
   WHERE (
          document_key = v_phone
          OR fn_normalize_phone_br(document_key) = fn_normalize_phone_br(v_phone)
          OR fn_normalize_phone_br(telefone) = fn_normalize_phone_br(v_phone)
         )
     AND whatsapp_instance IS NOT DISTINCT FROM NULLIF(v_instance, '')
   ORDER BY updated_at DESC
   LIMIT 1;
$old$;

  new_fragment := $new$
  -- external_message_conversation_lookup_v1
  IF NULLIF(v_external_message_id, '') IS NOT NULL THEN
    SELECT c.id, c.document_key, c.telefone
      INTO v_conv_id, v_phone, v_telefone
      FROM crm_chat_messages m
      JOIN crm_chat_conversations c ON c.id = m.conversation_id
     WHERE m.external_message_id = v_external_message_id
     ORDER BY m.created_at ASC
     LIMIT 1;
  END IF;

  IF v_conv_id IS NULL THEN
    -- normalized_conversation_lookup_v1
    SELECT id INTO v_conv_id
      FROM crm_chat_conversations
     WHERE (
            document_key = v_phone
            OR fn_normalize_phone_br(document_key) = fn_normalize_phone_br(v_phone)
            OR fn_normalize_phone_br(telefone) = fn_normalize_phone_br(v_phone)
           )
       AND whatsapp_instance IS NOT DISTINCT FROM NULLIF(v_instance, '')
     ORDER BY updated_at DESC
     LIMIT 1;
  END IF;
$new$;

  IF strpos(function_definition, old_fragment) = 0 THEN
    RAISE EXCEPTION 'Busca normalizada de conversa nao localizada.';
  END IF;

  EXECUTE replace(function_definition, old_fragment, new_fragment);
END;
$migration$;
