-- Configuracoes do CRM Chat (timeout, regras, etc)
CREATE TABLE IF NOT EXISTS crm_chat_config (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO crm_chat_config (key, value) VALUES
  ('timeout_automation', '{"enabled": true, "minutes": 10, "clara_webhook": "https://auto.mantovan.com.br/webhook/avmd-clara-inbound"}')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE crm_chat_config ENABLE ROW LEVEL SECURITY;
