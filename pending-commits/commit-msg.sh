#!/usr/bin/env bash
# Git commit-msg hook — redireciona qualquer commit para a fila pending-commits/
# Instalar: cp pending-commits/commit-msg.sh .git/hooks/commit-msg
set -euo pipefail

COMMIT_MSG_FILE="${1:-}"
MSG=""

# Le a primeira linha nao-comentario do arquivo de mensagem
if [ -n "$COMMIT_MSG_FILE" ] && [ -f "$COMMIT_MSG_FILE" ]; then
  MSG="$(grep -v '^#' "$COMMIT_MSG_FILE" 2>/dev/null | head -1 || true)"
fi

# Permite merges
if echo "${MSG:-}" | grep -q "^Merge "; then exit 0; fi

# Permite commits do proprio sistema de fila
if [ -n "${PENDING_QUEUE_APPLY:-}" ]; then exit 0; fi

# Nada staged → deixa passar
if [ -z "$(git diff --cached)" ]; then exit 0; fi

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${HOOK_DIR}/../.." && pwd)"
ENFILEIRAR="${REPO_ROOT}/pending-commits/enfileirar.sh"

if [ ! -f "$ENFILEIRAR" ]; then
  echo "AVISO: pending-commits/enfileirar.sh nao encontrado. Commit permitido."
  exit 0
fi

if [ -z "${MSG:-}" ]; then MSG="commit via IDE sem mensagem"; fi

# Enfileira tudo (staged + unstaged + untracked), exceto pending-commits/
git add -A
git reset HEAD -- pending-commits/ 2>/dev/null || true
bash "$ENFILEIRAR" "$MSG" || true

# Limpa a working tree: restaura HEAD, preserva pending-commits/
git reset --mixed HEAD -- . 2>/dev/null
git checkout HEAD -- . 2>/dev/null
git clean -fd --exclude=pending-commits/ 2>/dev/null || true

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  Commit redirecionado para pending-commits/         ║"
echo "║                                                     ║"
echo "║  Para efetivar todos os patches pendentes:          ║"
echo "║    PENDING_QUEUE_APPLY=1 bash pending-commits/aplicar-todos.sh  ║"
echo "║                                                     ║"
echo "║  Para ver a fila:                                   ║"
echo "║    ls pending-commits/*.patch                       ║"
echo "╚══════════════════════════════════════════════════════╝"

# Aborta o commit
exit 1
