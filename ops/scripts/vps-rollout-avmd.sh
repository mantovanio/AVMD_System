#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/avmd/AVMD_System"
FRONT_DIR="/var/www/crm.certiid.mantovan.com.br"
SERVICE_NAME="avmd-backend"
AVMD_WEB_SERVICE="${AVMD_WEB_SERVICE:-avmd_web}"
NGINX_SOURCE="${APP_DIR}/ops/nginx/avmd-web.conf"
NGINX_TARGET="/opt/avmd/nginx-avmd.conf"
NGINX_BACKUP_DIR="/opt/avmd/backups/nginx"
PUBLIC_API_URL="https://api.certiid.mantovan.com.br/healthz"
PUBLIC_CRM_URL="https://crm.certiid.mantovan.com.br"

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

require_file() {
  local path="$1"
  if [ ! -f "${path}" ]; then
    log "[ERRO] Arquivo obrigatorio ausente: ${path}"
    exit 1
  fi
}

install_edge_config() {
  require_file "${NGINX_SOURCE}"

  if ! command -v docker >/dev/null 2>&1; then
    log "[ERRO] Docker nao encontrado no host; nao e possivel reciclar o edge avmd_web"
    exit 1
  fi

  mkdir -p "${NGINX_BACKUP_DIR}"

  if [ -f "${NGINX_TARGET}" ]; then
    cp "${NGINX_TARGET}" "${NGINX_BACKUP_DIR}/nginx-avmd.$(date +'%Y%m%d-%H%M%S').conf.bak"
  fi

  log "5) Validando config do avmd_web"
  docker run --rm \
    -v "${NGINX_SOURCE}:/etc/nginx/conf.d/default.conf:ro" \
    -v "${FRONT_DIR}:/usr/share/nginx/html:ro" \
    nginx:1.27-alpine nginx -t

  log "6) Publicando config do edge"
  cp "${NGINX_SOURCE}" "${NGINX_TARGET}"

  log "7) Recarregando service ${AVMD_WEB_SERVICE}"
  docker service inspect "${AVMD_WEB_SERVICE}" >/dev/null
  docker service update --force "${AVMD_WEB_SERVICE}" >/dev/null
}

log "1) Atualizando codigo"
cd "${APP_DIR}"
git fetch --all --prune
git pull origin main

log "2) Instalando dependencias e gerando build"
npm ci
npm run build
npm run build:backend

log "3) Publicando frontend"
mkdir -p "${FRONT_DIR}"
rm -rf "${FRONT_DIR:?}"/*
cp -R dist/* "${FRONT_DIR}/"

log "4) Instalando/atualizando service do backend"
require_file "${APP_DIR}/ops/systemd/avmd-backend.service"
cp "${APP_DIR}/ops/systemd/avmd-backend.service" "/etc/systemd/system/${SERVICE_NAME}.service"
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"
systemctl restart "${SERVICE_NAME}"

install_edge_config

log "8) Smoke test local backend"
curl -fsS "http://127.0.0.1:8787/healthz"

log "9) Smoke test roteamento interno via Traefik"
curl -fsS -H "Host: api.certiid.mantovan.com.br" "http://127.0.0.1/healthz"

log "10) Smoke test publico da API (GET)"
curl -fsS "${PUBLIC_API_URL}"

log "11) Smoke test publico da API (HEAD)"
curl -fsSI "${PUBLIC_API_URL}" >/dev/null

log "Rollout finalizado"
log "Frontend: ${PUBLIC_CRM_URL}"
log "API: ${PUBLIC_API_URL}"
