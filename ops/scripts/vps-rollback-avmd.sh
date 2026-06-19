#!/usr/bin/env bash
set -euo pipefail

# Rollback rapido para parar AVMD sem afetar CRM antigo.

SERVICE_NAME="avmd-backend"
NGINX_SITE_LINK="/etc/nginx/sites-enabled/crm.certiid.mantovan.com.br.conf"

log() {
  echo "[$(date +'%F %T')] $*"
}

log "1) Parando backend AVMD"
systemctl stop "${SERVICE_NAME}" || true

log "2) Removendo roteamento nginx do AVMD (se existir)"
rm -f "${NGINX_SITE_LINK}" || true
nginx -t
systemctl reload nginx

log "Rollback concluido"
log "CRM legado permanece inalterado"
