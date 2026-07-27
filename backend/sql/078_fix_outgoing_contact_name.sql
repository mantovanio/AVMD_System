-- Mensagens de saida nunca podem usar o operador como nome do cliente.
-- Mantem somente nomes explicitamente associados ao contato e corrige
-- conversas contaminadas usando o cadastro/renovacao mais recente.
DO $migration$
DECLARE
  function_definition text;
  old_fragment text;
  new_fragment text;
BEGIN
  SELECT pg_get_functiondef('fn_sync_communication_event()'::regprocedure)
    INTO function_definition;

  old_fragment := $old$
  IF NOT v_is_from_me OR v_existing_nome IS NULL OR v_existing_nome = '' THEN
    v_cliente_nome := COALESCE(
      NEW.payload->>'from_name',
      NEW.payload->>'cliente_nome',
      NEW.payload->>'sender_name',
      NEW.payload->>'pushName',
      CASE WHEN v_is_email THEN v_subject ELSE NULL END,
      CASE WHEN v_is_email THEN split_part(v_phone, '@', 1) ELSE NULL END,
      v_existing_nome
    );
  ELSE
    v_cliente_nome := NULL;
  END IF;
$old$;

  new_fragment := $new$
  IF NOT v_is_from_me THEN
    v_cliente_nome := COALESCE(
      NULLIF(NEW.payload->>'from_name', ''),
      NULLIF(NEW.payload->>'cliente_nome', ''),
      NULLIF(NEW.payload->>'sender_name', ''),
      NULLIF(NEW.payload->>'pushName', ''),
      CASE WHEN v_is_email THEN v_subject ELSE NULL END,
      CASE WHEN v_is_email THEN split_part(v_phone, '@', 1) ELSE NULL END,
      v_existing_nome
    );
  ELSE
    v_cliente_nome := COALESCE(
      NULLIF(NEW.payload->>'contact_name', ''),
      NULLIF(NEW.payload->>'cliente_nome', ''),
      NULLIF(NEW.payload->>'from_name', ''),
      v_existing_nome
    );
  END IF;
$new$;

  IF strpos(function_definition, old_fragment) = 0 THEN
    RAISE EXCEPTION 'Trecho de nome do cliente nao localizado em fn_sync_communication_event.';
  END IF;

  EXECUTE replace(function_definition, old_fragment, new_fragment);
END;
$migration$;

WITH resolved AS (
  SELECT
    c.id,
    COALESCE(
      NULLIF(cust.nome, ''),
      (
        SELECT COALESCE(NULLIF(r.cliente, ''), NULLIF(r.razao_social, ''))
          FROM renovacoes r
         WHERE fn_normalize_phone_br(r.telefone) = fn_normalize_phone_br(c.telefone)
           AND r.deleted_at IS NULL
         ORDER BY r.updated_at DESC NULLS LAST, r.created_at DESC
         LIMIT 1
      )
    ) AS nome
  FROM crm_chat_conversations c
  LEFT JOIN crm_customers cust ON cust.id = c.crm_customer_id
  WHERE lower(btrim(COALESCE(c.cliente_nome, ''))) IN ('operador', 'operator', 'atendente', 'usuario', 'usuário')
)
UPDATE crm_chat_conversations c
   SET cliente_nome = resolved.nome,
       updated_at = NOW()
  FROM resolved
 WHERE c.id = resolved.id;
