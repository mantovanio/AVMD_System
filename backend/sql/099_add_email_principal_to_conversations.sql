-- =============================================================
-- 099: ADD EMAIL_PRINCIPAL TO CRM_CHAT_CONVERSATIONS
-- =============================================================

-- 1. Adiciona coluna email_principal na tabela de conversas
ALTER TABLE crm_chat_conversations
ADD COLUMN IF NOT EXISTS email_principal TEXT;

-- Index para busca por email
CREATE INDEX IF NOT EXISTS idx_conv_email_principal ON crm_chat_conversations (email_principal) WHERE email_principal IS NOT NULL;

-- 2. Atualiza a VIEW para usar a coluna direta (com fallback para customer e document_key)
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

-- 3. Backfill: popula email_principal para conversas existentes da fila 'agendamento' e 'email'
-- que tenham crm_customer_id mas não tenham email_principal
UPDATE crm_chat_conversations c
SET email_principal = cust.email
FROM crm_customers cust
WHERE c.crm_customer_id = cust.id
  AND c.email_principal IS NULL
  AND cust.email IS NOT NULL
  AND (c.fila IN ('agendamento', 'email') OR c.document_key LIKE '%@%');

-- 4. Para conversas da fila 'agendamento'/'email' sem crm_customer_id, tenta extrair email do document_key
UPDATE crm_chat_conversations
SET email_principal = document_key
WHERE email_principal IS NULL
  AND fila IN ('agendamento', 'email')
  AND document_key LIKE '%@%';