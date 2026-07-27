-- A trigger gravava mensagens novas, mas nao atualizava a conversa existente.
-- Isso deixava texto e anexos recebidos ocultos em conversas com data antiga.
DO $migration$
DECLARE
  function_definition text;
  anchor_fragment text;
  replacement_fragment text;
BEGIN
  SELECT pg_get_functiondef('fn_sync_communication_event()'::regprocedure)
    INTO function_definition;

  IF function_definition LIKE '%-- refresh_existing_conversation_v1%' THEN
    RETURN;
  END IF;

  anchor_fragment := $anchor$
  IF v_has_content THEN
    INSERT INTO crm_chat_messages (
$anchor$;

  replacement_fragment := $replacement$
  -- refresh_existing_conversation_v1
  UPDATE crm_chat_conversations
     SET telefone = COALESCE(v_telefone, telefone),
         whatsapp_instance = COALESCE(NULLIF(v_instance, ''), whatsapp_instance),
         fila = COALESCE(NULLIF(v_fila, ''), fila),
         ultima_mensagem = CASE WHEN v_has_content THEN v_content ELSE ultima_mensagem END,
         ultima_mensagem_direcao = CASE WHEN v_has_content THEN v_direction ELSE ultima_mensagem_direcao END,
         ultima_interacao_em = CASE WHEN v_has_content THEN NEW.created_at ELSE ultima_interacao_em END,
         cliente_nome = COALESCE(NULLIF(v_cliente_nome, ''), cliente_nome),
         crm_customer_id = COALESCE(v_customer_id, crm_customer_id),
         kanban_status = CASE
           WHEN NOT v_is_from_me
                AND lower(COALESCE(kanban_status, '')) IN ('resolvido', 'arquivado', 'arquivada', 'encerrado', 'encerrada', 'finalizado')
             THEN 'iniciou_conversa'
           WHEN NULLIF(v_kanban_status, '') IS NOT NULL THEN v_kanban_status
           ELSE kanban_status
         END,
         updated_at = NOW()
   WHERE id = v_conv_id;

  IF v_has_content THEN
    INSERT INTO crm_chat_messages (
$replacement$;

  IF strpos(function_definition, anchor_fragment) = 0 THEN
    RAISE EXCEPTION 'Ponto de atualizacao da conversa nao localizado.';
  END IF;

  EXECUTE replace(function_definition, anchor_fragment, replacement_fragment);
END;
$migration$;

-- Repara conversas que ja receberam mensagens sem atualizar o cabecalho.
WITH latest AS (
  SELECT DISTINCT ON (m.conversation_id)
         m.conversation_id,
         m.mensagem,
         m.direction,
         m.created_at
    FROM crm_chat_messages m
   ORDER BY m.conversation_id, m.created_at DESC
)
UPDATE crm_chat_conversations c
   SET ultima_mensagem = latest.mensagem,
       ultima_mensagem_direcao = latest.direction,
       ultima_interacao_em = latest.created_at,
       updated_at = NOW()
  FROM latest
 WHERE c.id = latest.conversation_id
   AND (c.ultima_interacao_em IS NULL OR latest.created_at > c.ultima_interacao_em);
