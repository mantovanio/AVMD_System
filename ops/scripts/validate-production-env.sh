#!/usr/bin/env bash
set -euo pipefail

# Guardiao de configuracao publica. O build usa .env.production; nunca permita
# publicar uma chave Clerk de outro dominio/ambiente por engano.
APP_DIR="${1:-/opt/avmd/AVMD_System}"
ENV_FILE="${APP_DIR}/.env.production"
BACKUP_DIR="${APP_DIR}/.deploy-env-backups"

fail() { echo "[ERRO] $*" >&2; exit 1; }

[ -f "${ENV_FILE}" ] || fail "${ENV_FILE} ausente. Deploy bloqueado."

value() {
  local name="$1"
  sed -n "s/^${name}=//p" "${ENV_FILE}" | tail -n 1 | tr -d '\r' | sed 's/^"//; s/"$//'
}

clerk_key="$(value VITE_CLERK_PUBLISHABLE_KEY)"
api_url="$(value VITE_API_BASE_URL)"

[[ "${clerk_key}" == pk_live_* ]] || fail "VITE_CLERK_PUBLISHABLE_KEY nao e uma chave live."
[[ "${api_url}" == "https://api.certiid.com.br/api" ]] || fail "VITE_API_BASE_URL nao aponta para api.certiid.com.br."

# A parte depois do prefixo e base64url; a chave live atual identifica
# certiid.com.br. Se a chave for rotacionada, ela precisa continuar vinculada
# ao dominio oficial antes de qualquer publicacao.
encoded="${clerk_key#pk_live_}"
decoded="$(printf '%s' "${encoded}" | tr '_-' '/+' | awk '{ l=length($0)%4; if (l==2) printf "%s==",$0; else if (l==3) printf "%s=",$0; else printf "%s",$0 }' | base64 -d 2>/dev/null || true)"
printf '%s' "${decoded}" | grep -qi 'certiid\.com\.br' || fail "A chave Clerk live nao esta vinculada a certiid.com.br."

mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"
cp -p "${ENV_FILE}" "${BACKUP_DIR}/.env.production.$(date +'%Y%m%d-%H%M%S').bak"
find "${BACKUP_DIR}" -type f -name '.env.production.*.bak' -printf '%T@ %p\n' | sort -nr | awk 'NR>10 {print $2}' | xargs -r rm -f

echo "Configuracao de producao validada: Clerk certiid.com.br e API oficial."
