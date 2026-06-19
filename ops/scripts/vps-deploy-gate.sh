#!/usr/bin/env bash
set -euo pipefail

# Gate obrigatorio para qualquer deploy do AVMD.
# Regras:
# 1) Guardiao ativo
# 2) Backup recente valido
# 3) Lock anti-concorrencia
# 4) So entao libera rollout

BACKUP_ROOT="/opt/backups/certiid"
BACKUP_MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS:-24}"
ROLLOUT_SCRIPT="${ROLLOUT_SCRIPT:-/opt/avmd/AVMD_System/ops/scripts/vps-rollout-avmd.sh}"
LOCK_FILE="/var/lock/avmd-deploy.lock"
LOG_FILE="/var/log/avmd-deploy-gate.log"

log() {
  echo "[$(date +'%F %T')] $*" | tee -a "${LOG_FILE}"
}

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    echo "[ERRO] Execute como root."
    exit 1
  fi
}

assert_guard_active() {
  systemctl is-active --quiet avmd-guard.timer || {
    log "BLOQUEADO: avmd-guard.timer inativo"
    exit 1
  }
  systemctl is-active --quiet avmd-guard.service || true
}

latest_backup_dir() {
  find "${BACKUP_ROOT}" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' 2>/dev/null | sort -nr | awk 'NR==1 {print $2}'
}

assert_backup_recent() {
  local latest now age_hours main_tar
  latest="$(latest_backup_dir || true)"
  if [ -z "${latest}" ]; then
    log "BLOQUEADO: nenhum backup encontrado em ${BACKUP_ROOT}"
    exit 1
  fi

  main_tar="${latest}/opt-certiid.tar.gz"
  if [ ! -f "${main_tar}" ]; then
    log "BLOQUEADO: backup sem arquivo principal (${main_tar})"
    exit 1
  fi

  now="$(date +%s)"
  age_hours="$(( (now - $(stat -c %Y "${latest}")) / 3600 ))"
  if [ "${age_hours}" -gt "${BACKUP_MAX_AGE_HOURS}" ]; then
    log "BLOQUEADO: backup antigo (${age_hours}h > ${BACKUP_MAX_AGE_HOURS}h)"
    exit 1
  fi

  log "Backup validado: ${latest} (${age_hours}h)"
}

assert_rollout_exists() {
  if [ ! -x "${ROLLOUT_SCRIPT}" ]; then
    log "BLOQUEADO: rollout script ausente ou sem permissao (${ROLLOUT_SCRIPT})"
    exit 1
  fi
}

run_with_lock() {
  exec 9>"${LOCK_FILE}"
  if ! flock -n 9; then
    log "BLOQUEADO: ja existe deploy em execucao"
    exit 1
  fi

  log "Gate aprovado. Iniciando rollout via ${ROLLOUT_SCRIPT}."
  DEPLOY_GATE_APPROVED=1 "${ROLLOUT_SCRIPT}"
  log "Deploy concluido com gate."
}

main() {
  require_root
  assert_guard_active
  assert_backup_recent
  assert_rollout_exists
  run_with_lock
}

main
