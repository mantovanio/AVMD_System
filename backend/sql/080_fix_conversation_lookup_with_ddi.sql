-- Evita criar duas conversas para o mesmo telefone quando um evento chega
-- com DDI 55 e outro fluxo usa apenas DDD + numero.
DO $migration$
DECLARE
  function_definition text;
  old_fragment text;
  new_fragment text;
BEGIN
  SELECT pg_get_functiondef('fn_sync_communication_event()'::regprocedure)
    INTO function_definition;

  IF function_definition LIKE '%-- normalized_conversation_lookup_v1%' THEN
    RETURN;
  END IF;

  old_fragment := $old$
  SELECT id INTO v_conv_id
    FROM crm_chat_conversations
   WHERE document_key = v_phone
     AND whatsapp_instance IS NOT DISTINCT FROM NULLIF(v_instance, '')
   ORDER BY updated_at DESC
   LIMIT 1;
$old$;

  new_fragment := $new$
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
$new$;

  IF strpos(function_definition, old_fragment) = 0 THEN
    RAISE EXCEPTION 'Busca de conversa nao localizada em fn_sync_communication_event.';
  END IF;

  EXECUTE replace(function_definition, old_fragment, new_fragment);
END;
$migration$;
