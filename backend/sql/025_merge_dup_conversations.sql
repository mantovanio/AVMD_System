-- Merge conversas duplicadas: email ↔ telefone (completo)

-- 1) Mover mensagens das email-conversations (com ou sem crm_customer_id) 
--    para a phone-conversation correspondente
UPDATE crm_chat_messages m
SET conversation_id = pc.id
FROM crm_chat_conversations ec
JOIN crm_customers c 
  ON c.id = ec.crm_customer_id 
  OR LOWER(COALESCE(c.email, '')) = LOWER(ec.document_key)
JOIN crm_chat_conversations pc 
  ON pc.crm_customer_id = c.id
  AND pc.document_key ~ '^[0-9]+$'
  AND pc.id != ec.id
WHERE ec.document_key LIKE '%@%'
  AND ec.document_key NOT LIKE '%@s.whatsapp.net'
  AND ec.document_key NOT LIKE '%@g.us'
  AND ec.document_key NOT LIKE '%@lid'
  AND m.conversation_id = ec.id;

-- 2) Deletar email-conversations (agora sem mensagens)
DELETE FROM crm_chat_conversations
WHERE id IN (
  SELECT ec.id
  FROM crm_chat_conversations ec
  JOIN crm_customers c 
    ON c.id = ec.crm_customer_id 
    OR LOWER(COALESCE(c.email, '')) = LOWER(ec.document_key)
  JOIN crm_chat_conversations pc 
    ON pc.crm_customer_id = c.id
    AND pc.document_key ~ '^[0-9]+$'
    AND pc.id != ec.id
  WHERE ec.document_key LIKE '%@%'
    AND ec.document_key NOT LIKE '%@s.whatsapp.net'
    AND ec.document_key NOT LIKE '%@g.us'
    AND ec.document_key NOT LIKE '%@lid'
);

-- 3) Vincular crm_customer_id nas phone-conversations com base no match de email
UPDATE crm_chat_conversations pc
SET
  crm_customer_id = COALESCE(pc.crm_customer_id, c.id),
  updated_at      = NOW()
FROM crm_customers c
WHERE pc.crm_customer_id IS NULL
  AND pc.document_key ~ '^[0-9]+$'
  AND regexp_replace(COALESCE(pc.document_key, ''), '[^0-9]', '', 'g') = regexp_replace(COALESCE(c.telefone, ''), '[^0-9]', '', 'g');

-- 4) Email-conversation sem phone-conversation par: atualizar document_key para telefone
UPDATE crm_chat_conversations ec
SET
  document_key = regexp_replace(COALESCE(c.telefone, ''), '[^0-9]', '', 'g'),
  telefone     = regexp_replace(COALESCE(c.telefone, ''), '[^0-9]', '', 'g'),
  updated_at   = NOW()
FROM crm_customers c
WHERE ec.crm_customer_id = c.id
  AND ec.document_key LIKE '%@%'
  AND ec.document_key NOT LIKE '%@s.whatsapp.net'
  AND ec.document_key NOT LIKE '%@g.us'
  AND ec.document_key NOT LIKE '%@lid'
  AND c.telefone IS NOT NULL AND c.telefone <> ''
  AND NOT EXISTS (
    SELECT 1 FROM crm_chat_conversations pc
    WHERE pc.crm_customer_id = c.id
      AND pc.document_key ~ '^[0-9]+$'
      AND pc.id != ec.id
  );
