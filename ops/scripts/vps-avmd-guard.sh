#!/usr/bin/env bash
set -euo pipefail

# Guardiao de recursos da VPS.
# Se a maquina ficar sob estresse continuo, executa rollback do AVMD.

STATE_DIR="/var/lib/avmd-guard"
STATE_FILE="${STATE_DIR}/state.env"
LOG_FILE="/var/log/avmd-guard.log"

CPU_LOAD_THRESHOLD="${CPU_LOAD_THRESHOLD:-0.85}"
MEM_USED_THRESHOLD="${MEM_USED_THRESHOLD:-90}"
CONSECUTIVE_FAILS_LIMIT="${CONSECUTIVE_FAILS_LIMIT:-3}"

ROLLBACK_CANDIDATES=(
  "/root/vps-rollback-avmd.sh"
  "/opt/avmd/AVMD_System/ops/scripts/vps-rollback-avmd.sh"
)

mkdir -p "${STATE_DIR}"

log() {
  echo "[$(date +'%F %T')] $*" | tee -a "${LOG_FILE}"
}

load_state() {
  FAILS=0
  TRIGGERED=0
  if [ -f "${STATE_FILE}" ]; then
    # shellcheck disable=SC1090
    source "${STATE_FILE}"
  fi
}

save_state() {
  cat > "${STATE_FILE}" <<EOF
FAILS=${FAILS}
TRIGGERED=${TRIGGERED}
EOF
}

calc_cpu_ratio() {
  local load cores
  load="$(awk '{print $1}' /proc/loadavg)"
  cores="$(nproc)"
  awk -v l="${load}" -v c="${cores}" 'BEGIN { if (c <= 0) c = 1; printf "%.4f", l/c }'
}

calc_mem_used_pct() {
  free | awk '/Mem:/ { if ($2 == 0) { print 0 } else { printf "%.0f", ($3/$2)*100 } }'
}

find_rollback_script() {
  for path in "${ROLLBACK_CANDIDATES[@]}"; do
    if [ -x "${path}" ]; then
      echo "${path}"
      return 0
    fi
  done
  return 1
}

main() {
  load_state

  local cpu_ratio mem_used pressure
  cpu_ratio="$(calc_cpu_ratio)"
  mem_used="$(calc_mem_used_pct)"
  pressure=0

  awk -v x="${cpu_ratio}" -v t="${CPU_LOAD_THRESHOLD}" 'BEGIN { exit !(x > t) }' && pressure=1 || true
  if [ "${mem_used}" -gt "${MEM_USED_THRESHOLD}" ]; then
    pressure=1
  fi

  if [ "${pressure}" -eq 1 ]; then
    FAILS=$((FAILS + 1))
    log "PRESSAO detectada | cpu_ratio=${cpu_ratio} (limite=${CPU_LOAD_THRESHOLD}) | mem_used=${mem_used}% (limite=${MEM_USED_THRESHOLD}%) | falhas_consecutivas=${FAILS}/${CONSECUTIVE_FAILS_LIMIT}"
  else
    FAILS=0
    log "OK | cpu_ratio=${cpu_ratio} | mem_used=${mem_used}%"
  fi

  if [ "${TRIGGERED}" -eq 0 ] && [ "${FAILS}" -ge "${CONSECUTIVE_FAILS_LIMIT}" ]; then
    local rollback_script
    rollback_script="$(find_rollback_script || true)"
    if [ -n "${rollback_script}" ]; then
      log "LIMITE excedido. Executando rollback automatico via ${rollback_script}"
      "${rollback_script}" || true
      TRIGGERED=1
      log "Rollback automatico concluido. AVMD desativado para proteger VPS."
    else
      log "LIMITE excedido, mas script de rollback nao encontrado."
    fi
  fi

  save_state
}

main
