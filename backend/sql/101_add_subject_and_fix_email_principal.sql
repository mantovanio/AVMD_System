-- =============================================================
-- 101: ADD SUBJECT + FIX EMAIL_PRINCIPAL IN TRIGGER
-- =============================================================
-- A migration 100 adicionou NULLIF(v_email,'') nos VALUES mas
-- esqueceu de adicionar email_principal na lista de colunas do INSERT.
-- Esta migration:
--   1. Adiciona coluna subject na tabela crm_chat_conversations
--   2. Corrige o INSERT para incluir email_principal e subject nas colunas
--   3. Adiciona subject nos VALUES e no ON CONFLICT UPDATE
--   4. Adiciona subject no refresh_existing_conversation UPDATE
--   5. Backfill do subject a partir de communication_events

-- ============================================================
-- 1. ADICIONAR COLUNA SUBJECT
-- ============================================================
ALTER TABLE crm_chat_conversations
ADD COLUMN IF NOT EXISTS subject TEXT;

CREATE INDEX IF NOT EXISTS idx_conv_subject ON crm_chat_conversations (subject) WHERE subject IS NOT NULL;

-- ============================================================
-- 2. ATUALIZAR VIEW PARA INCLUIR SUBJECT
-- ============================================================
DROP VIEW IF EXISTS crm_chat_admin_view;

CREATE VIEW crm_chat_admin_view AS
SELECT
  c.id, c.document_key, c.telefone, c.cliente_nome,
  c.avatar_url, c.avatar_updated_at,
  c.whatsapp_instance, c.numero_receptor, c.fila, c.kanban_status,
  c.atendimento_humano, c.agente_nome, c.ultima_mensagem,
  c.ultima_mensagem_direcao, c.ultima_interacao_em, c.created_at,
  c.crm_customer_id,
  c.email_principal,
  c.subject,
  cust.nome AS nome_crm,
  cust.empresa_nome,
  COALESCE(c.email_principal, cust.email, CASE WHEN c.document_key LIKE '%@%' THEN c.document_key ELSE NULL END) AS email_principal_resolved,
  cust.cpf, cust.cnpj, cust.observacoes, cust.contato_status,
  a.agent_id::text AS agente_atual, a.created_at::text AS agente_desde
FROM crm_chat_conversations c
LEFT JOIN crm_customers cust ON cust.id = c.crm_customer_id
LEFT JOIN LATERAL (
  SELECT agent_id, created_at
    FROM crm_chat_assignments
   WHERE conversation_id = c.id::text AND ativo = true
   ORDER BY created_at DESC
   LIMIT 1
) a ON true;

-- ============================================================
-- 3. PATCH NO TRIGGER: CORRIGIR INSERT + ADICIONAR SUBJECT
-- ============================================================
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

  -- Idempotencia: se ja tem subject no INSERT, nada a fazer
  IF function_definition LIKE '%subject,%' AND function_definition LIKE '%v_subject%' THEN
    RAISE NOTICE 'fn_sync_communication_event ja contem subject; ignorando patch.';
    RETURN;
  END IF;

  ---------------------------------------------------------------
  -- PATCH Z: extrair v_subject do payload (antes estava NULL)
  ---------------------------------------------------------------
  function_definition := replace(
    function_definition,
    $old$v_email := COALESCE(NEW.payload->>'customer_email', NEW.payload->>'email', '');
$old$,
    $new$v_email := COALESCE(NEW.payload->>'customer_email', NEW.payload->>'email', '');
  v_subject := COALESCE(NEW.payload->>'subject', '');
$new$
  );

  ---------------------------------------------------------------
  -- PATCH A: adicionar email_principal e subject nas colunas INSERT
  -- O bug da migration 100: colunas tinham 10 items, VALUES tinham 11
  ---------------------------------------------------------------
  function_definition := replace(
    function_definition,
    $old$  kanban_status,
  crm_customer_id,
  email_principal
)$old$,
    $new$  kanban_status,
  crm_customer_id,
  email_principal,
  subject
)$new$
  );

  -- Fallback: se email_principal ainda nao esta nas colunas (migration 100 nao aplicada corretamente)
  IF position('email_principal' in function_definition) = 0 THEN
    function_definition := replace(
      function_definition,
      $old$  kanban_status,
  crm_customer_id
)$old$,
      $new$  kanban_status,
  crm_customer_id,
  email_principal,
  subject
)$new$
    );
  END IF;

  ---------------------------------------------------------------
  -- PATCH B: adicionar NULLIF(v_subject, '') nos VALUES do INSERT
  ---------------------------------------------------------------
  function_definition := replace(
    function_definition,
    $old$NULLIF(v_email, '')
    )
    ON CONFLICT (document_key) WHERE document_key ~ '^[0-9]+$'$old$,
    $new$NULLIF(v_email, ''),
    NULLIF(v_subject, '')
    )
    ON CONFLICT (document_key) WHERE document_key ~ '^[0-9]+$'$new$
  );

  -- Fallback: se NULLIF(v_email) nao esta nos VALUES mas v_customer_id esta
  IF position('NULLIF(v_email' in function_definition) = 0 THEN
    function_definition := replace(
      function_definition,
      $old$  v_customer_id
    )
    ON CONFLICT (document_key) WHERE document_key ~ '^[0-9]+$'$old$,
      $new$  v_customer_id,
    NULLIF(v_email, ''),
    NULLIF(v_subject, '')
    )
    ON CONFLICT (document_key) WHERE document_key ~ '^[0-9]+$'$new$
    );
  END IF;

  ---------------------------------------------------------------
  -- PATCH C: adicionar email_principal e subject no ON CONFLICT UPDATE
  ---------------------------------------------------------------
  function_definition := replace(
    function_definition,
    $old$      email_principal = COALESCE(EXCLUDED.email_principal, crm_chat_conversations.email_principal),
      updated_at = NOW()
    RETURNING id INTO v_conv_id;$old$,
    $new$      email_principal = COALESCE(EXCLUDED.email_principal, crm_chat_conversations.email_principal),
      subject = COALESCE(EXCLUDED.subject, crm_chat_conversations.subject),
      updated_at = NOW()
    RETURNING id INTO v_conv_id;$new$
  );

  ---------------------------------------------------------------
  -- PATCH D: adicionar email_principal e subject no refresh_existing UPDATE
  ---------------------------------------------------------------
  function_definition := replace(
    function_definition,
    $old$         email_principal = COALESCE(NULLIF(v_email, ''), email_principal),
         kanban_status = CASE$old$,
    $new$         email_principal = COALESCE(NULLIF(v_email, ''), email_principal),
         subject = COALESCE(NULLIF(v_subject, ''), subject),
         kanban_status = CASE$new$
  );

  EXECUTE function_definition;

  RAISE NOTICE 'fn_sync_communication_event atualizada com subject + email_principal fix.';
END;
$migration$;

-- ============================================================
-- 4. BACKFILL: PREENCHER SUBJECT EM CONVERSAS EXISTENTES
-- ============================================================

-- 4a) De communication_events (source=email) - pegar o subject mais recente
WITH latest_event AS (
  SELECT DISTINCT ON (ce.conversation_id)
         ce.conversation_id,
         ce.payload->>'subject' AS event_subject
    FROM communication_events ce
   WHERE ce.source = 'email'
     AND NULLIF(ce.payload->>'subject', '') IS NOT NULL
   ORDER BY ce.conversation_id, ce.created_at DESC
)
UPDATE crm_chat_conversations c
   SET subject = le.event_subject,
       updated_at = NOW()
  FROM latest_event le
 WHERE c.id::text = le.conversation_id
   AND c.subject IS NULL;

-- 4b) Para conversas de fila='email' sem subject, gerar padrao a partir do pedido_numero
--     Padrão: "Tratativa sobre seu agendamento Certificado Digital - Pedido XXXXX"
WITH latest_pedido AS (
  SELECT DISTINCT ON (c.id)
         c.id AS conv_id,
         see.pedido_numero
    FROM crm_chat_conversations c
    JOIN schedule_email_events see ON (
      c.document_key = see.customer_phone
      OR fn_normalize_phone_br(c.document_key) = fn_normalize_phone_br(see.customer_phone)
    )
   WHERE c.subject IS NULL
     AND c.fila = 'email'
     AND see.pedido_numero IS NOT NULL
     AND see.pedido_numero <> ''
   ORDER BY c.id, see.created_at DESC
)
UPDATE crm_chat_conversations c
   SET subject = 'Tratativa sobre seu agendamento Certificado Digital - Pedido ' || lp.pedido_numero,
       updated_at = NOW()
  FROM latest_pedido lp
 WHERE c.id = lp.conv_id
   AND c.subject IS NULL;

-- 4c) Extrair "Pedido: XXXXX" do conteudo das mensagens
WITH pedido_extracted AS (
  SELECT DISTINCT ON (c.id)
    c.id as conv_id,
    regexp_replace(
      m.mensagem,
      '.*Pedido:\s*(?:c&oacute;digo\s+)?(\d+).*',
      '\1',
      'i'
    ) as pedido_numero
  FROM crm_chat_conversations c
  JOIN crm_chat_messages m ON m.conversation_id = c.id
  WHERE c.fila = 'email'
    AND c.subject IS NULL
    AND m.mensagem ~* 'Pedido:\s*(?:c&oacute;digo\s+)?\d+'
  ORDER BY c.id, m.created_at ASC
)
UPDATE crm_chat_conversations c
SET subject = 'Tratativa sobre seu agendamento Certificado Digital - Pedido ' || pe.pedido_numero,
    updated_at = NOW()
FROM pedido_extracted pe
WHERE c.id = pe.conv_id
  AND c.subject IS NULL
  AND pe.pedido_numero ~ '^\d+$';
