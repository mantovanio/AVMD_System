-- 054_add_leads_chat_columns.sql
-- Colunas adicionais para leads_contabilidade (usadas pelo Chat ao Vivo)
-- Equivalente ao 009_chat_leads_columns.sql que nao foi executado em producao

ALTER TABLE leads_contabilidade
  ADD COLUMN IF NOT EXISTS resumo_conversa       text,
  ADD COLUMN IF NOT EXISTS ultima_mensagem        text,
  ADD COLUMN IF NOT EXISTS horario_comercial      boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS data_agendamento       timestamptz,
  ADD COLUMN IF NOT EXISTS agendamento_criado_em  timestamptz,
  ADD COLUMN IF NOT EXISTS follow_up_1            timestamptz,
  ADD COLUMN IF NOT EXISTS follow_up_2            timestamptz,
  ADD COLUMN IF NOT EXISTS follow_up_3            timestamptz,
  ADD COLUMN IF NOT EXISTS evolution_remote_jid   text,
  ADD COLUMN IF NOT EXISTS evolution_instance     text;
