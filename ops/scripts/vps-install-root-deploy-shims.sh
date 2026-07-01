#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/avmd/AVMD_System}"
ROOT_DIR="/root"

if [ "$(id -u)" -ne 0 ]; then
  echo "[ERRO] Execute como root."
  exit 1
fi

install_wrapper() {
  local target="$1"
  local source="$2"
  cat > "${target}" <<EOF
#!/usr/bin/env bash
set -euo pipefail
exec bash "${source}" "\$@"
EOF
  chmod +x "${target}"
  echo "[ok] wrapper atualizado: ${target} -> ${source}"
}

install_wrapper "${ROOT_DIR}/vps-deploy-gate.sh" "${APP_DIR}/ops/scripts/vps-deploy-gate.sh"
install_wrapper "${ROOT_DIR}/vps-rollout-avmd.sh" "${APP_DIR}/ops/scripts/vps-rollout-avmd.sh"
install_wrapper "${ROOT_DIR}/vps-rollback-avmd.sh" "${APP_DIR}/ops/scripts/vps-rollback-avmd.sh"

echo "Wrappers legados sincronizados com os scripts canonicos do repositorio."
