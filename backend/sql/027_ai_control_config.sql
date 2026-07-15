-- Configuracao de controle de IA (Clara/N8N) por canal
INSERT INTO crm_chat_config (key, value) VALUES
  ('ai_control', '{"enabled": true, "atendimento_ia_enabled": false, "renovacao_ia_enabled": true, "description": "Controla se a IA (Clara/N8N) responde automaticamente. atendimento_ia_enabled=false desliga IA no canal Atendimento; renovacao_ia_enabled controla canal Renovacoes."}')
ON CONFLICT (key) DO NOTHING;
