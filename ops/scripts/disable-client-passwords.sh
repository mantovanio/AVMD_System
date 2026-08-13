#!/bin/bash
set -e

# Buscar profiles de clientes com Clerk
PROFILES=$(docker exec postgres_postgres.1.c9qf8g1z5x0ct7t266ew6ijs9 psql -U avmd -d avmd -t -A -F"|" -c "
  SELECT clerk_user_id, email FROM profiles
  WHERE clerk_user_id IS NOT NULL
    AND tipo_vinculo = 'cliente_portal'
    AND status = 'ativo'
")

# Ler CLERK_SECRET_KEY do .env
CLERK_SECRET=$(grep CLERK_SECRET_KEY /opt/avmd/AVMD_System/backend/.env.local | head -1 | sed 's/^CLERK_SECRET_KEY=//')

if [ -z "$CLERK_SECRET" ]; then
  echo "ERRO: CLERK_SECRET_KEY nao encontrada"
  exit 1
fi

DISABLED=0
SKIPPED=0
ERRORS=0

while IFS="|" read -r clerk_id email; do
  [ -z "$clerk_id" ] && continue
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X PATCH "https://api.clerk.com/v1/users/$clerk_id" \
    -H "Authorization: Bearer $CLERK_SECRET" \
    -H "Content-Type: application/json" \
    -d '{"password_enabled": false}')
  if [ "$HTTP_CODE" = "200" ]; then
    DISABLED=$((DISABLED + 1))
    echo "OK: $email ($clerk_id)"
  elif [ "$HTTP_CODE" = "404" ]; then
    SKIPPED=$((SKIPPED + 1))
    echo "SKIP (404): $email ($clerk_id)"
  else
    ERRORS=$((ERRORS + 1))
    echo "ERRO ($HTTP_CODE): $email ($clerk_id)"
  fi
done <<< "$PROFILES"

echo ""
echo "Resultado: $DISABLED desabilitados, $SKIPPED nao encontrados, $ERRORS erros"
