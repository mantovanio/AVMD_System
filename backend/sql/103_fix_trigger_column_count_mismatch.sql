-- =============================================================
-- 103: FIX TRIGGER COLUMN/VALUES COUNT MISMATCH
-- =============================================================
-- A migration 101 tentou corrigir o INSERT da trigger mas
-- a verificacao de idempotencia (LIKE '%subject,%') nao
-- detectou que as COLUNAS ainda estavam faltando.
-- O INSERT tem 10 colunas mas 12 VALUES.
-- Esta migration recria a trigger com as colunas corretas.

DO $migration$
DECLARE
  function_definition text;
  fn_id regproc;
  fixed_definition text;
BEGIN
  SELECT oid INTO fn_id
    FROM pg_proc
   WHERE proname = 'fn_sync_communication_event'
   LIMIT 1;

  IF fn_id IS NULL THEN
    RAISE NOTICE 'fn_sync_communication_event nao encontrada; ignorando.';
    RETURN;
  END IF;

  SELECT pg_get_functiondef(fn_id) INTO function_definition;

  -- Corrigir o INSERT: adicionar email_principal e subject nas colunas
  fixed_definition := replace(
    function_definition,
    $old$  kanban_status,
  crm_customer_id
)$old$,
    $old$  kanban_status,
  crm_customer_id,
  email_principal,
  subject
)$old$
  );

  -- Se email_principal ja esta nas colunas mas subject nao
  IF fixed_definition = function_definition THEN
    fixed_definition := replace(
      function_definition,
      $old$  kanban_status,
  crm_customer_id,
  email_principal
)$old$,
      $old$  kanban_status,
  crm_customer_id,
  email_principal,
  subject
)$old$
    );
  END IF;

  IF fixed_definition <> function_definition THEN
    EXECUTE fixed_definition;
    RAISE NOTICE 'fn_sync_communication_event corrigida: colunas do INSERT ajustadas.';
  ELSE
    RAISE NOTICE 'fn_sync_communication_event ja correta; ignorando.';
  END IF;
END;
$migration$;
