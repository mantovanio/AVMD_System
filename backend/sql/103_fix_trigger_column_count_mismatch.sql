-- =============================================================
-- 103: FIX TRIGGER COLUMN/VALUES COUNT MISMATCH
-- =============================================================
-- O INSERT tem 10 colunas mas 12 VALUES.
-- email_principal e subject precisam ser adicionados nas colunas.

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

  -- Tentar padrao inline: "kanban_status, crm_customer_id"
  fixed_definition := replace(
    function_definition,
    'kanban_status, crm_customer_id',
    'kanban_status, crm_customer_id, email_principal, subject'
  );

  IF fixed_definition <> function_definition THEN
    EXECUTE fixed_definition;
    RAISE NOTICE 'fn_sync_communication_event corrigida: colunas do INSERT ajustadas.';
  ELSE
    RAISE NOTICE 'fn_sync_communication_event ja correta ou padrao nao encontrado.';
  END IF;
END;
$migration$;
