DROP VIEW IF EXISTS crm_chat_admin_view;

CREATE VIEW crm_chat_admin_view AS
SELECT
  c.id, c.document_key, c.telefone, c.cliente_nome,
  c.avatar_url, c.avatar_updated_at,
  c.whatsapp_instance, c.numero_receptor, c.fila, c.kanban_status,
  c.atendimento_humano, c.agente_nome, c.ultima_mensagem,
  c.ultima_mensagem_direcao, c.ultima_interacao_em, c.created_at,
  c.crm_customer_id,
  cust.nome AS nome_crm,
  cust.empresa_nome,
  COALESCE(cust.email, email_event.customer_email) AS email_principal,
  cust.cpf, cust.cnpj, cust.observacoes, cust.contato_status,
  a.agent_id::text AS agente_atual, a.created_at::text AS agente_desde
FROM crm_chat_conversations c
LEFT JOIN crm_customers cust ON cust.id = c.crm_customer_id
LEFT JOIN LATERAL (
  SELECT NULLIF(TRIM(LOWER(ce.payload->>'customer_email')), '') AS customer_email
  FROM communication_events ce
  WHERE NULLIF(TRIM(ce.payload->>'customer_email'), '') IS NOT NULL
    AND (
      ce.conversation_id = c.document_key
      OR ce.conversation_id = c.id::text
      OR ce.contact = c.document_key
      OR ce.contact = c.telefone
    )
  ORDER BY ce.created_at DESC
  LIMIT 1
) email_event ON true
LEFT JOIN LATERAL (
  SELECT agent_id, created_at
  FROM crm_chat_assignments
  WHERE conversation_id = c.id::text AND ativo = true
  ORDER BY created_at DESC
  LIMIT 1
) a ON true;
