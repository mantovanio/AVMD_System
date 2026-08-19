-- O trigger fn_sync_communication_event cria conversas sem email_principal.
-- O campo v_email ja e extraido do payload (customer_email / email) mas nao
-- era gravado na conversa. Este patch adiciona email_principal em 3 pontos:
--   1. INSERT da conversa nova
--   2. ON CONFLICT (race-condition upsert)
--   3. UPDATE de conversa existente (refresh_existing_conversation)
-- Alem disso, faz backfill das conversas existentes.

DO $migration$
DECLARE
  function_definition text;
  fn_id regproc;
BEGIN
  SELECT oid INTO fn_id
    FROM pg_proc
   WHERE proname = 'fn_sync_communication_event'
   LIMIT 1;

  IF fn_id IS NULL THEN
    RAISE NOTICE 'fn_sync_communication_event nao encontrada; ignorando patch.';
    RETURN;
  END IF;

  SELECT pg_get_functiondef(fn_id) INTO function_definition;

  -- Idempotencia: se ja tem email_principal no INSERT, nada a fazer
  IF function_definition LIKE '%kanban_status,%' AND function_definition LIKE '%email_principal%' THEN
    RAISE NOTICE 'fn_sync_communication_event ja contem email_principal; ignorando patch.';
    RETURN;
  END IF;

  ---------------------------------------------------------------
  -- PATCH 1: adicionar email_principal na lista de colunas INSERT
  ---------------------------------------------------------------
  function_definition := replace(
    function_definition,
    $old$  kanban_status,
  crm_customer_id
)$old$,
    $new$  kanban_status,
  crm_customer_id,
  email_principal
)$new$
  );

  ---------------------------------------------------------------
  -- PATCH 2: adicionar NULLIF(v_email, '') nos VALUES do INSERT
  ---------------------------------------------------------------
  function_definition := replace(
    function_definition,
    $old$  v_customer_id
    )
    ON CONFLICT (document_key) WHERE document_key ~ '^[0-9]+$'$old$,
    $new$  v_customer_id,
    NULLIF(v_email, '')
    )
    ON CONFLICT (document_key) WHERE document_key ~ '^[0-9]+$'$new$
  );

  ---------------------------------------------------------------
  -- PATCH 3: adicionar email_principal no ON CONFLICT UPDATE
  ---------------------------------------------------------------
  function_definition := replace(
    function_definition,
    $old$      crm_customer_id = COALESCE(EXCLUDED.crm_customer_id, crm_chat_conversations.crm_customer_id),
      updated_at = NOW()
    RETURNING id INTO v_conv_id;$old$,
    $new$      crm_customer_id = COALESCE(EXCLUDED.crm_customer_id, crm_chat_conversations.crm_customer_id),
      email_principal = COALESCE(EXCLUDED.email_principal, crm_chat_conversations.email_principal),
      updated_at = NOW()
    RETURNING id INTO v_conv_id;$new$
  );

  ---------------------------------------------------------------
  -- PATCH 4: adicionar email_principal no refresh_existing_conversation UPDATE
  ---------------------------------------------------------------
  function_definition := replace(
    function_definition,
    $old$         crm_customer_id = COALESCE(v_customer_id, crm_customer_id),
         kanban_status = CASE$old$,
    $new$         crm_customer_id = COALESCE(v_customer_id, crm_customer_id),
         email_principal = COALESCE(NULLIF(v_email, ''), email_principal),
         kanban_status = CASE$new$
  );

  EXECUTE function_definition;

  RAISE NOTICE 'fn_sync_communication_event atualizada com email_principal.';
END;
$migration$;

-- ============================================================
-- BACKFILL: preencher email_principal em conversas existentes
-- ============================================================

-- 1) De schedule_email_events (source=certifast) -> communication_events -> conversas
WITH latest_event AS (
  SELECT DISTINCT ON (ce.conversation_id)
         ce.conversation_id,
         ce.payload->>'customer_email' AS event_email
    FROM communication_events ce
   WHERE ce.source = 'email'
     AND NULLIF(ce.payload->>'customer_email', '') IS NOT NULL
   ORDER BY ce.conversation_id, ce.created_at DESC
)
UPDATE crm_chat_conversations c
   SET email_principal = le.event_email,
       updated_at = NOW()
  FROM latest_event le
 WHERE c.id::text = le.conversation_id
   AND c.email_principal IS NULL;

-- 2) De crm_customers vinculados a conversas
UPDATE crm_chat_conversations c
   SET email_principal = cust.email,
       updated_at = NOW()
  FROM crm_customers cust
 WHERE c.crm_customer_id = cust.id
   AND c.email_principal IS NULL
   AND NULLIF(cust.email, '') IS NOT NULL;

-- 3) De conversation_id que e电话号码, tentar achar customer por telefone
UPDATE crm_chat_conversations c
   SET email_principal = cust.email,
       updated_at = NOW()
  FROM crm_customers cust
 WHERE c.email_principal IS NULL
   AND c.crm_customer_id IS NULL
   AND NULLIF(cust.email, '') IS NOT NULL
   AND fn_normalize_phone_br(cust.telefone) = fn_normalize_phone_br(c.document_key);

-- 4) De conversation_id que contem @, usar como email_principal
UPDATE crm_chat_conversations
   SET email_principal = document_key,
       updated_at = NOW()
 WHERE fila = 'email'
   AND email_principal IS NULL
   AND document_key LIKE '%@%';

-- 5) Extrair email do conteudo das mensagens (corpo do email)
--    Padrão: "Email: xxx@yyy.com" no HTML/texto da mensagem
WITH emails_extracted AS (
  SELECT DISTINCT ON (c.id)
    c.id as conv_id,
    regexp_replace(
      m.mensagem,
      '.*Email:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}).*',
      '\1',
      'i'
    ) as extracted_email
  FROM crm_chat_conversations c
  JOIN crm_chat_messages m ON m.conversation_id = c.id
  WHERE c.fila = 'email'
    AND c.email_principal IS NULL
    AND m.mensagem ~* 'Email:\s*[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
  ORDER BY c.id, m.created_at ASC
)
UPDATE crm_chat_conversations c
SET email_principal = ee.extracted_email,
    updated_at = NOW()
FROM emails_extracted ee
WHERE c.id = ee.conv_id
  AND ee.extracted_email ~* '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$';
