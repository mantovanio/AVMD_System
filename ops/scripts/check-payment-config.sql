-- Check external_integrations for mercado_pago
SELECT id, provider, status, api_token IS NOT NULL as has_token, base_url, webhook_url FROM external_integrations WHERE provider = 'mercado_pago';

-- Check payment_methods
SELECT key, value FROM app_settings WHERE key = 'payment_methods';

-- Check payment_runtime
SELECT key, value FROM app_settings WHERE key = 'payment_runtime';

-- Check formas_pagamento_v2
SELECT id, nome, codigo, tipo, gateway, ativo FROM formas_pagamento_v2 ORDER BY nome;
