#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="avmd-backend"
AVMD_WEB_SERVICE="${AVMD_WEB_SERVICE:-avmd_web}"
NGINX_TARGET="/opt/avmd/nginx-avmd.conf"
NGINX_BACKUP_DIR="/opt/avmd/backups/nginx"

log() {
  echo "[$(date +'%F %T')] $*"
}

restore_latest_nginx_backup() {
  local latest_backup
  latest_backup="$(find "${NGINX_BACKUP_DIR}" -maxdepth 1 -type f -name 'nginx-avmd.*.conf.bak' | sort | tail -n 1 || true)"

  if [ -z "${latest_backup}" ]; then
    log "Nenhum backup de nginx encontrado em ${NGINX_BACKUP_DIR}; mantendo config atual"
    return
  fi

  cp "${latest_backup}" "${NGINX_TARGET}"
  log "Config restaurada a partir de ${latest_backup}"
}

log "1) Parando backend AVMD"
systemctl stop "${SERVICE_NAME}" || true

if command -v docker >/dev/null 2>&1; then
  log "2) Restaurando config do edge e reciclando ${AVMD_WEB_SERVICE}"
  restore_latest_nginx_backup
  docker service inspect "${AVMD_WEB_SERVICE}" >/dev/null 2>&1 && docker service update --force "${AVMD_WEB_SERVICE}" >/dev/null || true
else
  log "Docker indisponivel; rollback limitado ao backend"
fi

log "Rollback concluido"
log "CRM legado permanece inalterado"
