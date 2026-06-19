#!/usr/bin/env bash
set -euo pipefail

echo "== PRE-FLIGHT VPS (AVMD) =="

echo "[1] CPU e memoria atuais"
uptime
free -h

echo "[2] Top processos por CPU"
ps -eo pid,ppid,cmd,%mem,%cpu --sort=-%cpu | head -n 12

echo "[3] Top processos por memoria"
ps -eo pid,ppid,cmd,%mem,%cpu --sort=-%mem | head -n 12

echo "[4] Saude dos servicos criticos"
systemctl is-active docker || true
systemctl is-active nginx || true

echo "[5] Containers (se houver)"
if command -v docker >/dev/null 2>&1; then
  docker stats --no-stream || true
fi

echo "[6] Regra de seguranca sugerida"
echo "Somente iniciar AVMD se uso medio de CPU < 65% e RAM livre > 20%"
