-- Tabela de vínculo ponto ↔ agente (permite um agente em vários pontos)
CREATE TABLE IF NOT EXISTS pontos_atendimento_agentes (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ponto_atendimento_id uuid NOT NULL REFERENCES pontos_atendimento(id) ON DELETE CASCADE,
  agente_id            uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  principal            boolean NOT NULL DEFAULT false,
  ativo                boolean NOT NULL DEFAULT true,
  metadata             jsonb NOT NULL DEFAULT '{}',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ponto_atendimento_id, agente_id)
);
CREATE INDEX IF NOT EXISTS idx_paa_ponto   ON pontos_atendimento_agentes(ponto_atendimento_id);
CREATE INDEX IF NOT EXISTS idx_paa_agente  ON pontos_atendimento_agentes(agente_id);

-- Colunas adicionais para leads_contabilidade (usadas pelo Chat ao Vivo)
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

-- Colunas do Kanban do Chat
CREATE TABLE IF NOT EXISTS chat_kanban_columns (
  id         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  status_key text    NOT NULL UNIQUE,
  label      text    NOT NULL,
  color      text    NOT NULL DEFAULT 'text-gray-700',
  bg         text    NOT NULL DEFAULT 'bg-gray-100',
  border     text    NOT NULL DEFAULT 'border-gray-300',
  ordem      integer NOT NULL DEFAULT 0,
  ativo      boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Stubs para compatibilidade com ChatInboxCRM
CREATE TABLE IF NOT EXISTS crm_chat_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id text NOT NULL,
  agent_id        text,
  ativo           boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS communication_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id text,
  event_type      text,
  payload         jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
