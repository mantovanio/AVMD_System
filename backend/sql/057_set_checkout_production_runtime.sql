-- 057_set_checkout_production_runtime.sql
-- Coloca o checkout publico em modo de producao.

INSERT INTO app_settings (key, value)
VALUES (
  'payment_runtime',
  jsonb_build_object(
    'modo_teste_geral', false,
    'bloquear_integracoes_reais', false,
    'aviso_checkout', 'O atendimento sera liberado apos a confirmacao do pagamento.'
  )
)
ON CONFLICT (key) DO UPDATE
SET value = jsonb_build_object(
    'modo_teste_geral', false,
    'bloquear_integracoes_reais', false,
    'aviso_checkout', 'O atendimento sera liberado apos a confirmacao do pagamento.'
  ),
  updated_at = NOW();
