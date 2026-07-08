#!/usr/bin/env bash
# Enfileira as mudancas nao commitadas como um patch ordenado por timestamp.
# Uso: bash pending-commits/enfileirar.sh "mensagem do commit"
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Uso: $0 \"mensagem do commit\""
  exit 1
fi

DIR="$(cd "$(dirname "$0")" && pwd)"
TIMESTAMP="$(date +'%Y%m%d-%H%M%S')"
SLUG="$(echo "$1" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//' | head -c 60)"
FILENAME="${TIMESTAMP}-${SLUG}.patch"
PATCH_PATH="${DIR}/${FILENAME}"

# Captura o diff completo (staged + unstaged)
DIFF=$( (git diff --cached && git diff) || true)

# Verifica se ha diff
if [ -z "$DIFF" ]; then
  echo "Nenhuma mudanca para enfileirar."
  exit 0
fi

# Calcula hash sha256 do diff
HASH=$(echo "$DIFF" | sha256sum | cut -d' ' -f1)
HASH_LABEL="Patch-Hash: sha256:${HASH}"

# Verifica se algum patch na fila ja tem o mesmo hash
for EXISTING in "${DIR}"/*.patch; do
  [ -f "$EXISTING" ] || continue
  if grep -q "^${HASH_LABEL}$" "$EXISTING" 2>/dev/null; then
    echo "IGNORADO: diff ja enfileirado em $(basename "$EXISTING")"
    exit 0
  fi
done

# Verifica se ja existe commit com o mesmo hash
if git log --oneline --grep="${HASH_LABEL}" --all --max-count=1 2>/dev/null | grep -q .; then
  echo "IGNORADO: diff ja commitado (git log --grep=\"${HASH_LABEL}\")"
  exit 0
fi

# Cria o patch com hash
{
  echo "From: pending-queue <queue@avmd.local>"
  echo "Date: $(date -R)"
  echo "Subject: $1"
  echo "${HASH_LABEL}"
  echo "---"
  echo "$DIFF"
} > "${PATCH_PATH}"

echo "Enfileirado: ${FILENAME}"
echo "Mensagem: $1"
echo "Hash: sha256:${HASH}"
