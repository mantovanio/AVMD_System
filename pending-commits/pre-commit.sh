#!/usr/bin/env bash
# Git pre-commit hook — guarda para bypassar a fila com PENDING_QUEUE_APPLY
# Instalar: cp pending-commits/pre-commit.sh .git/hooks/pre-commit
set -euo pipefail

# Se a fila esta sendo aplicada, permite o commit passar
if [ -n "${PENDING_QUEUE_APPLY:-}" ]; then exit 0; fi

# Nada staged → deixa passar
if [ -z "$(git diff --cached)" ]; then exit 0; fi

# Se o hook commit-msg existir, ele fara o resto
# So sai com sucesso para que o commit-msg possa rodar
exit 0
