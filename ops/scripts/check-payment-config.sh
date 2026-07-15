#!/bin/bash
export PGPASSWORD=avmd123ABC
PSQL="psql -h 127.0.0.1 -U avmd -d avmd -t -A"

echo "=== EXTERNAL_INTEGRATIONS ==="
$PSQL -c "SELECT id, provider, status, api_token IS NOT NULL as has_token, base_url FROM external_integrations WHERE provider = 'mercado_pago';"

echo "=== PAYMENT_METHODS ==="
$PSQL -c "SELECT value::text FROM app_settings WHERE key = 'payment_methods';"

echo "=== PAYMENT_RUNTIME ==="
$PSQL -c "SELECT value::text FROM app_settings WHERE key = 'payment_runtime';"

echo "=== FORMAS_PAGAMENTO ==="
$PSQL -c "SELECT id, nome, codigo, tipo, gateway, ativo FROM formas_pagamento_v2 ORDER BY nome;"
