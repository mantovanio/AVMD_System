#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/avmd/AVMD_System"
FRONT_DIR="/var/www/crm.certiid.mantovan.com.br"
PORTAL_DIR="/var/www/portal.certiid.com.br"
SERVICE_NAME="avmd-backend"
AVMD_WEB_SERVICE="${AVMD_WEB_SERVICE:-avmd_web}"
NGINX_SOURCE="${APP_DIR}/ops/nginx/avmd-web.conf"
NGINX_TARGET="/opt/avmd/nginx-avmd.conf"
NGINX_BACKUP_DIR="/opt/avmd/backups/nginx"
PUBLIC_API_URL="https://api.certiid.com.br/healthz"
LEGACY_API_URL="https://api.certiid.mantovan.com.br/healthz"
PUBLIC_CRM_URL="https://crm.certiid.com.br"
LEGACY_CRM_URL="https://crm.certiid.mantovan.com.br"
PUBLIC_PORTAL_URL="https://portal.certiid.com.br"
PUBLIC_API_RETRIES="${PUBLIC_API_RETRIES:-8}"
PUBLIC_API_RETRY_DELAY_SEC="${PUBLIC_API_RETRY_DELAY_SEC:-5}"
PUBLIC_CRM_RETRIES="${PUBLIC_CRM_RETRIES:-8}"
PUBLIC_CRM_RETRY_DELAY_SEC="${PUBLIC_CRM_RETRY_DELAY_SEC:-5}"
FRONT_VALIDATOR="${APP_DIR}/ops/scripts/validate-frontend-assets.sh"
FRONT_NEXT_DIR="${FRONT_DIR}.next"
FRONT_PREVIOUS_DIR="${FRONT_DIR}.previous"
PORTAL_NEXT_DIR="${PORTAL_DIR}.next"
PORTAL_PREVIOUS_DIR="${PORTAL_DIR}.previous"
DEPLOY_STATE_DIR="/opt/avmd/deploys"

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

validate_frontend_directory() {
  require_file "${FRONT_VALIDATOR}"
  bash "${FRONT_VALIDATOR}" directory "$1"
}

validate_public_crm() {
  local attempt
  for ((attempt=1; attempt<=PUBLIC_CRM_RETRIES; attempt++)); do
    if bash "${FRONT_VALIDATOR}" url "${PUBLIC_CRM_URL}"; then
      return 0
    fi

    log "Tentativa ${attempt}/${PUBLIC_CRM_RETRIES} da validacao visual do CRM falhou."
    if [ "${attempt}" -lt "${PUBLIC_CRM_RETRIES}" ]; then
      sleep "${PUBLIC_CRM_RETRY_DELAY_SEC}"
    fi
  done

  return 1
}

validate_public_portal() {
  local attempt
  for ((attempt=1; attempt<=PUBLIC_CRM_RETRIES; attempt++)); do
    if bash "${FRONT_VALIDATOR}" url "${PUBLIC_PORTAL_URL}"; then
      return 0
    fi

    log "Tentativa ${attempt}/${PUBLIC_CRM_RETRIES} da validacao visual do portal falhou."
    if [ "${attempt}" -lt "${PUBLIC_CRM_RETRIES}" ]; then
      sleep "${PUBLIC_CRM_RETRY_DELAY_SEC}"
    fi
  done

  return 1
}

restore_previous_frontend() {
  if [ ! -d "${FRONT_PREVIOUS_DIR}" ]; then
    log "[ERRO] Nao existe frontend anterior para restaurar."
    return 1
  fi

  log "Restaurando frontend anterior apos falha de validacao."
  rm -rf "${FRONT_DIR:?}"
  mv "${FRONT_PREVIOUS_DIR}" "${FRONT_DIR}"
  docker service update --force "${AVMD_WEB_SERVICE}" >/dev/null
}

publish_frontend() {
  log "3) Validando frontend antes da publicacao"
  validate_frontend_directory "${APP_DIR}/dist"

  log "4) Publicando frontend com versao anterior preservada"
  rm -rf "${FRONT_NEXT_DIR:?}"
  mkdir -p "${FRONT_NEXT_DIR}"
  cp -R "${APP_DIR}/dist/." "${FRONT_NEXT_DIR}/"
  validate_frontend_directory "${FRONT_NEXT_DIR}"

  rm -rf "${FRONT_PREVIOUS_DIR:?}"
  if [ -d "${FRONT_DIR}" ]; then
    mv "${FRONT_DIR}" "${FRONT_PREVIOUS_DIR}"
  fi
  mv "${FRONT_NEXT_DIR}" "${FRONT_DIR}"
}

publish_portal() {
  log "4.1) Publicando portal com versao anterior preservada"
  rm -rf "${PORTAL_NEXT_DIR:?}"
  mkdir -p "${PORTAL_NEXT_DIR}"
  cp -R "${APP_DIR}/dist/." "${PORTAL_NEXT_DIR}/"
  if [ ! -f "${PORTAL_NEXT_DIR}/portal.html" ]; then
    log "[ERRO] Build do portal ausente em ${PORTAL_NEXT_DIR}/portal.html"
    exit 1
  fi

  cp "${PORTAL_NEXT_DIR}/portal.html" "${PORTAL_NEXT_DIR}/index.html"

  rm -rf "${PORTAL_PREVIOUS_DIR:?}"
  if [ -d "${PORTAL_DIR}" ]; then
    mv "${PORTAL_DIR}" "${PORTAL_PREVIOUS_DIR}"
  fi
  mv "${PORTAL_NEXT_DIR}" "${PORTAL_DIR}"
}

restore_previous_portal() {
  if [ ! -d "${PORTAL_PREVIOUS_DIR}" ]; then
    log "[ERRO] Nao existe portal anterior para restaurar."
    return 1
  fi

  log "Restaurando portal anterior apos falha de validacao."
  rm -rf "${PORTAL_DIR:?}"
  mv "${PORTAL_PREVIOUS_DIR}" "${PORTAL_DIR}"
  docker service update --force "${AVMD_WEB_SERVICE}" >/dev/null
}

record_frontend_release() {
  mkdir -p "${DEPLOY_STATE_DIR}"
  {
    echo "commit=$(git rev-parse HEAD)"
    echo "published_at=$(date --iso-8601=seconds)"
    echo "frontend_url=${PUBLIC_CRM_URL}"
  } > "${DEPLOY_STATE_DIR}/frontend-last-known-good"
}

smoke_test_public_api_get() {
  local attempt http_code
  for ((attempt=1; attempt<=PUBLIC_API_RETRIES; attempt++)); do
    http_code="$(curl -sS -o /tmp/avmd-public-api-healthz.body -w '%{http_code}' "${PUBLIC_API_URL}" || true)"
    if [ "${http_code}" = "200" ]; then
      return 0
    fi

    log "Tentativa ${attempt}/${PUBLIC_API_RETRIES} do health publico retornou HTTP ${http_code:-erro}."
    if [ "${attempt}" -lt "${PUBLIC_API_RETRIES}" ]; then
      sleep "${PUBLIC_API_RETRY_DELAY_SEC}"
    fi
  done

  log "[ERRO] Health publico falhou apos ${PUBLIC_API_RETRIES} tentativas."
  if [ -f /tmp/avmd-public-api-healthz.body ]; then
    log "Ultimo body (ate 300 chars): $(head -c 300 /tmp/avmd-public-api-healthz.body | tr '\n' ' ')"
  fi
  return 1
}

smoke_test_public_api_head() {
  local attempt http_code
  for ((attempt=1; attempt<=PUBLIC_API_RETRIES; attempt++)); do
    http_code="$(curl -sSI -o /dev/null -w '%{http_code}' "${PUBLIC_API_URL}" || true)"
    if [ "${http_code}" = "200" ]; then
      return 0
    fi

    log "Tentativa ${attempt}/${PUBLIC_API_RETRIES} do HEAD publico retornou HTTP ${http_code:-erro}."
    if [ "${attempt}" -lt "${PUBLIC_API_RETRIES}" ]; then
      sleep "${PUBLIC_API_RETRY_DELAY_SEC}"
    fi
  done

  log "[ERRO] HEAD publico falhou apos ${PUBLIC_API_RETRIES} tentativas."
  return 1
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
    -v "${PORTAL_DIR}:/usr/share/nginx/portal:ro" \
    nginx:1.27-alpine nginx -t

  log "6) Publicando config do edge"
  cp "${NGINX_SOURCE}" "${NGINX_TARGET}"

  log "7) Recarregando service ${AVMD_WEB_SERVICE}"
  docker service inspect "${AVMD_WEB_SERVICE}" >/dev/null
  if ! docker service inspect --format '{{json .Spec.TaskTemplate.ContainerSpec.Mounts}}' "${AVMD_WEB_SERVICE}" | grep -q '/usr/share/nginx/portal'; then
    docker service update \
      --mount-add type=bind,src="${PORTAL_DIR}",dst=/usr/share/nginx/portal,readonly \
      "${AVMD_WEB_SERVICE}" >/dev/null
  fi

  docker service update \
    --label-add "traefik.http.routers.avmd-crm-http.rule=Host(\`crm.certiid.com.br\`) || Host(\`crm.certiid.mantovan.com.br\`)" \
    --label-add "traefik.http.routers.avmd-crm.rule=Host(\`crm.certiid.com.br\`) || Host(\`crm.certiid.mantovan.com.br\`)" \
    --label-add "traefik.http.routers.avmd-api-http.rule=Host(\`api.certiid.com.br\`) || Host(\`api.certiid.mantovan.com.br\`)" \
    --label-add "traefik.http.routers.avmd-api.rule=Host(\`api.certiid.com.br\`) || Host(\`api.certiid.mantovan.com.br\`)" \
    --label-add "traefik.http.routers.avmd-portal-http.entrypoints=web" \
    --label-add "traefik.http.routers.avmd-portal-http.rule=Host(\`portal.certiid.com.br\`)" \
    --label-add "traefik.http.routers.avmd-portal-http.middlewares=avmd-portal-https" \
    --label-add "traefik.http.middlewares.avmd-portal-https.redirectscheme.scheme=https" \
    --label-add "traefik.http.middlewares.avmd-portal-https.redirectscheme.permanent=true" \
    --label-add "traefik.http.routers.avmd-portal.entrypoints=websecure" \
    --label-add "traefik.http.routers.avmd-portal.rule=Host(\`portal.certiid.com.br\`)" \
    --label-add "traefik.http.routers.avmd-portal.service=avmd-web" \
    --label-add "traefik.http.routers.avmd-portal.tls=true" \
    --label-add "traefik.http.routers.avmd-portal.tls.certresolver=letsencryptresolver" \
    "${AVMD_WEB_SERVICE}" >/dev/null

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

publish_frontend
publish_portal

log "5) Instalando/atualizando service do backend"
require_file "${APP_DIR}/ops/systemd/avmd-backend.service"
mkdir -p "${APP_DIR}/storage/attachments"
chown -R www-data:www-data "${APP_DIR}/storage"
find "${APP_DIR}/storage" -type d -exec chmod 2775 {} +
find "${APP_DIR}/storage" -type f -exec chmod 0664 {} +
cp "${APP_DIR}/ops/systemd/avmd-backend.service" "/etc/systemd/system/${SERVICE_NAME}.service"
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"
systemctl restart "${SERVICE_NAME}"

install_edge_config

log "8) Validando layout publico do CRM"
if ! validate_public_crm; then
  restore_previous_frontend
  log "[ERRO] O CRM publicado nao passou na validacao. A versao anterior foi restaurada."
  exit 1
fi

log "8.1) Validando layout publico do portal"
if ! validate_public_portal; then
  restore_previous_portal
  log "[ERRO] O portal publico nao passou na validacao."
  exit 1
fi
record_frontend_release

log "9) Smoke test local backend"
curl -fsS "http://127.0.0.1:8787/healthz"

log "10) Smoke test roteamento interno via Traefik"
curl -fsS -H "Host: api.certiid.com.br" "http://127.0.0.1/healthz"

log "11) Smoke test publico da API (GET)"
smoke_test_public_api_get

log "12) Smoke test publico da API (HEAD)"
smoke_test_public_api_head

log "Rollout finalizado"
log "Frontend: ${PUBLIC_CRM_URL}"
log "Frontend legado: ${LEGACY_CRM_URL}"
log "Portal: ${PUBLIC_PORTAL_URL}"
log "API: ${PUBLIC_API_URL}"
log "API legada: ${LEGACY_API_URL}"
