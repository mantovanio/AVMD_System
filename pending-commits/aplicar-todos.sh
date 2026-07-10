#!/usr/bin/env bash
# Aplica todos os patches pendentes em ordem, limpando a fila.
# Uso: bash pending-commits/aplicar-todos.sh [--dry-run]
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
DRY_RUN="${1:-}"

shopt -s nullglob
PATCHES=("${DIR}"/*.patch)
shopt -u nullglob

if [ ${#PATCHES[@]} -eq 0 ]; then
  echo "Nenhum patch pendente."
  exit 0
fi

echo "Encontrados ${#PATCHES[@]} patch(s) pendentes."

for PATCH in "${PATCHES[@]}"; do
  BASENAME="$(basename "${PATCH}")"

  # Extrai Subject e Hash do cabecalho
  SUBJECT="$(head -10 "${PATCH}" | grep '^Subject: ' | sed 's/^Subject: //' || echo "${BASENAME}")"
  HASH_LINE="$(head -10 "${PATCH}" | grep '^Patch-Hash: ' || true)"

  echo ""
  echo "=== Aplicando: ${BASENAME} ==="
  echo "Mensagem: ${SUBJECT}"
  if [ -n "${HASH_LINE}" ]; then
    echo "${HASH_LINE}"
  fi

  # Verifica se o hash ja foi commitado (seguranca extra)
  if [ -n "${HASH_LINE}" ] && git log --oneline --grep="${HASH_LINE}" --all --max-count=1 2>/dev/null | grep -q .; then
    echo "  JA COMMITADO — pulando e removendo patch."
    rm "${PATCH}"
    continue
  fi

  if [ "${DRY_RUN}" = "--dry-run" ]; then
    git apply --stat "${PATCH}"
    echo "  (dry-run — nao aplicado)"
  else
    PENDING_QUEUE_APPLY=1 git apply "${PATCH}"
    rm "${PATCH}"
    git add -A
    BUILD_MSG="${SUBJECT}"
    if [ -n "${HASH_LINE}" ]; then
      BUILD_MSG="${BUILD_MSG}

${HASH_LINE}"
    fi
    PENDING_QUEUE_APPLY=1 git commit -m "${BUILD_MSG}"
    echo "  Aplicado e commitado. Patch removido da fila."
  fi
done

echo ""
echo "Fila processada."
