-- ============================================================
-- 003_renovacoes_schema.sql
-- Sistema de renovação de certificados digitais
-- Executar como: psql $DATABASE_URL -f 003_renovacoes_schema.sql
-- ============================================================

-- ── renovacoes ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS renovacoes (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido                TEXT,
  protocolo             TEXT,
  data_vencimento       DATE          NOT NULL,
  cliente               TEXT          NOT NULL,
  email                 TEXT,
  telefone              TEXT,
  tipo_certificado      TEXT          NOT NULL DEFAULT 'Não especificado',
  valor                 NUMERIC(12,2),
  status                TEXT          NOT NULL DEFAULT 'pendente'
                        CHECK (status IN ('pendente','contatado','convertido','perdido')),
  renovado              BOOLEAN       NOT NULL DEFAULT false,
  observacoes           TEXT,
  cpf                   TEXT,
  cnpj                  TEXT,
  razao_social          TEXT,
  agr                   TEXT,
  vendedor              TEXT,
  contador              TEXT,
  ultimo_lembrete       TIMESTAMPTZ,
  -- FK opcionais para integração futura com demais tabelas
  venda_certificado_id  UUID,
  produto_emitido_id    UUID,
  cadastro_base_id      UUID,
  empresa_id            UUID,
  titular_id            UUID,
  vendedor_fk_id        UUID,
  agente_registro_fk_id UUID,
  contador_fk_id        UUID,
  snapshot_json         JSONB         NOT NULL DEFAULT '{}',
  -- soft-delete
  deleted_at            TIMESTAMPTZ,
  deleted_by            TEXT,
  motivo_exclusao       TEXT,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_renovacoes_data_vencimento ON renovacoes (data_vencimento);
CREATE INDEX IF NOT EXISTS idx_renovacoes_status          ON renovacoes (status);
CREATE INDEX IF NOT EXISTS idx_renovacoes_deleted_at      ON renovacoes (deleted_at);
CREATE INDEX IF NOT EXISTS idx_renovacoes_telefone        ON renovacoes (telefone);

-- ── communication_templates ──────────────────────────────────
CREATE TABLE IF NOT EXISTS communication_templates (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT    NOT NULL,
  channel      TEXT    NOT NULL CHECK (channel IN ('whatsapp','email')),
  subject      TEXT,
  body         TEXT    NOT NULL,
  template_key TEXT    NOT NULL UNIQUE,
  ativo        BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- templates padrão
INSERT INTO communication_templates (name, channel, subject, body, template_key, ativo) VALUES
(
  'Lembrete WhatsApp padrão',
  'whatsapp',
  NULL,
  'Olá {{primeiro_nome}}, seu certificado {{tipo_certificado}} vence em {{dias_restantes}} dias ({{data_vencimento}}). Podemos ajudar com a renovação! 🔐',
  'wa_lembrete_padrao',
  true
),
(
  'Lembrete e-mail padrão',
  'email',
  'Renovação do seu certificado {{tipo_certificado}}',
  'Olá {{primeiro_nome}},\n\nSeu certificado {{tipo_certificado}} vence em {{dias_restantes}} dias ({{data_vencimento}}).\n\nEntre em contato para renovar e evitar interrupções.\n\nEquipe AR CERTI ID',
  'email_lembrete_padrao',
  true
)
ON CONFLICT (template_key) DO NOTHING;

-- ── automation_rules ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS automation_rules (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key   TEXT    NOT NULL UNIQUE,
  label      TEXT    NOT NULL,
  channel    TEXT    NOT NULL DEFAULT 'whatsapp_email',
  dias_antes INTEGER,
  ativo      BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO automation_rules (rule_key, label, channel, dias_antes, ativo) VALUES
  ('ren30',    'Lembrete 30 dias antes',            'whatsapp_email', 30,   false),
  ('ren15',    'Lembrete 15 dias antes',            'whatsapp_email', 15,   false),
  ('ren7',     'Lembrete 7 dias antes',             'whatsapp_email',  7,   false),
  ('followup', 'Follow-up pós vencimento (10 dias)','whatsapp_email', -10,  false)
ON CONFLICT (rule_key) DO NOTHING;

-- ── links_produtos ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS links_produtos (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_certificado  TEXT    NOT NULL UNIQUE,
  link_renovacao    TEXT,
  link_nova_emissao TEXT,
  descricao         TEXT,
  ativo             BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── leads_contabilidade ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads_contabilidade (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_lead           TEXT,
  whatsapp_lead       TEXT,
  motivo_contato      TEXT,
  status              TEXT DEFAULT 'iniciou_conversa',
  inicio_atendimento  TIMESTAMPTZ,
  anotacoes           TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── communication_outbox ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS communication_outbox (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  channel       TEXT    NOT NULL DEFAULT 'email',
  provider      TEXT    NOT NULL DEFAULT 'email_smtp',
  to_address    TEXT    NOT NULL,
  subject       TEXT,
  body          TEXT    NOT NULL,
  status        TEXT    NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','sent','failed')),
  payload       JSONB   NOT NULL DEFAULT '{}',
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at       TIMESTAMPTZ,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbox_status        ON communication_outbox (status);
CREATE INDEX IF NOT EXISTS idx_outbox_scheduled_for ON communication_outbox (scheduled_for);
