-- Evita corrida entre o retorno do webhook da Evolution e o envio humano.
-- Ambos podem tentar criar a mesma conversa numerica ao mesmo tempo.
DO $migration$
DECLARE
  function_definition text;
  old_fragment text;
  new_fragment text;
BEGIN
  SELECT pg_get_functiondef('fn_sync_communication_event()'::regprocedure)
    INTO function_definition;

  IF function_definition LIKE '%ON CONFLICT (document_key) WHERE document_key ~ ''^[0-9]+$''%' THEN
    RETURN;
  END IF;

  old_fragment := $old$
      v_customer_id
    )
    RETURNING id INTO v_conv_id;
$old$;

  new_fragment := $new$
      v_customer_id
    )
    ON CONFLICT (document_key) WHERE document_key ~ '^[0-9]+$'
    DO UPDATE SET
      telefone = COALESCE(EXCLUDED.telefone, crm_chat_conversations.telefone),
      whatsapp_instance = COALESCE(EXCLUDED.whatsapp_instance, crm_chat_conversations.whatsapp_instance),
      fila = COALESCE(EXCLUDED.fila, crm_chat_conversations.fila),
      ultima_mensagem = COALESCE(EXCLUDED.ultima_mensagem, crm_chat_conversations.ultima_mensagem),
      ultima_mensagem_direcao = COALESCE(EXCLUDED.ultima_mensagem_direcao, crm_chat_conversations.ultima_mensagem_direcao),
      ultima_interacao_em = COALESCE(EXCLUDED.ultima_interacao_em, crm_chat_conversations.ultima_interacao_em),
      cliente_nome = COALESCE(EXCLUDED.cliente_nome, crm_chat_conversations.cliente_nome),
      crm_customer_id = COALESCE(EXCLUDED.crm_customer_id, crm_chat_conversations.crm_customer_id),
      updated_at = NOW()
    RETURNING id INTO v_conv_id;
$new$;

  IF strpos(function_definition, old_fragment) = 0 THEN
    RAISE EXCEPTION 'Trecho esperado de fn_sync_communication_event nao foi localizado.';
  END IF;

  function_definition := replace(function_definition, old_fragment, new_fragment);
  EXECUTE function_definition;
END;
$migration$;
