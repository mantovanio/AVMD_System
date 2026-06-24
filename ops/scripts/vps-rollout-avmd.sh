#!/usr/bin/env bash
set -euo pipefail

# Rollout controlado do AVMD em paralelo ao CRM antigo.
# Nao remove stack antigo e nao altera trafego do dominio legado.

APP_DIR="/opt/avmd/AVMD_System"
FRONT_DIR="/var/www/crm.certiid.mantovan.com.br"
SERVICE_NAME="avmd-backend"
NGINX_SITE="/etc/nginx/sites-available/crm.certiid.mantovan.com.br.conf"
NGINX_SITE_LINK="/etc/nginx/sites-enabled/crm.certiid.mantovan.com.br.conf"

if [ "${DEPLOY_GATE_APPROVED:-0}" != "1" ]; then
  echo "[ERRO] Deploy bloqueado: execute via /root/vps-deploy-gate.sh"
  exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "[ERRO] Execute como root."
  exit 1
fi

log() {
  echo "[$(date +'%F %T')] $*"
}

log "1) Atualizando codigo"
cd "${APP_DIR}"
git fetch --all --prune
git pull origin main

log "2) Instalando dependencias e build"
npm ci
npm run build
npm run build:backend

log "3) Publicando frontend"
mkdir -p "${FRONT_DIR}"
rm -rf "${FRONT_DIR:?}"/*
cp -R dist/* "${FRONT_DIR}/"

log "4) Instalando config nginx (sem mexer no legado)"
if command -v nginx >/dev/null 2>&1; then
  if [ -d /etc/nginx/sites-available ] && [ -d /etc/nginx/sites-enabled ] && [ -f "${APP_DIR}/ops/nginx/crm.certiid.mantovan.com.br.conf" ]; then
    cp "${APP_DIR}/ops/nginx/crm.certiid.mantovan.com.br.conf" "${NGINX_SITE}" || { log "Aviso: falha ao copiar config nginx; continuando"; }
    ln -sfn "${NGINX_SITE}" "${NGINX_SITE_LINK}" || true
    nginx -t && systemctl reload nginx || log "Aviso: reload nginx falhou; continuando"
  else
    log "Nginx presente, mas sem estrutura esperada ou arquivo ausente; pulando configuracao de proxy"
  fi
else
  log "Nginx nao instalado neste host; pulando etapa de proxy"
fi

log "5) Instalando/atualizando service do backend"
if [ -f "${APP_DIR}/ops/systemd/avmd-backend.service" ]; then
  cp "${APP_DIR}/ops/systemd/avmd-backend.service" "/etc/systemd/system/${SERVICE_NAME}.service"
  systemctl daemon-reload
  systemctl enable "${SERVICE_NAME}"
  systemctl restart "${SERVICE_NAME}"
else
  log "Arquivo de service nao encontrado em ${APP_DIR}/ops/systemd/avmd-backend.service"
fi

log "6) Smoke test local da API"
curl -fsS "http://127.0.0.1:8787/healthz" | cat

log "Rollout finalizado"
log "Frontend: https://crm.certiid.mantovan.com.br"
log "API: https://api.certiid.mantovan.com.br"
