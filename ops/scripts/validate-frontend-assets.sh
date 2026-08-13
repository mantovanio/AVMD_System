#!/usr/bin/env bash
set -euo pipefail

# Bloqueia builds sem as utilities do Tailwind que estruturam o CRM.
MIN_CSS_BYTES="${MIN_CSS_BYTES:-80000}"
REQUIRED_CSS_MARKERS=(".flex{" ".grid{" ".fixed{" ".bg-white{")

fail() {
  echo "[ERRO] Validacao do frontend: $*" >&2
  exit 1
}

extract_css_path() {
  local index_file="$1"
  grep -oE 'assets/[^"?]+\.css' "${index_file}" | head -n 1 || true
}

validate_css_file() {
  local css_file="$1"
  local css_bytes marker

  [ -f "${css_file}" ] || fail "CSS ausente: ${css_file}"
  css_bytes="$(wc -c < "${css_file}")"
  [ "${css_bytes}" -ge "${MIN_CSS_BYTES}" ] || fail "CSS com ${css_bytes} bytes; minimo esperado: ${MIN_CSS_BYTES}"

  for marker in "${REQUIRED_CSS_MARKERS[@]}"; do
    grep -Fq "${marker}" "${css_file}" || fail "regra essencial ausente no CSS: ${marker}"
  done

  echo "${css_bytes}"
}

validate_directory() {
  local directory="$1"
  local index_file="${directory}/index.html"
  local css_relative css_file css_bytes

  [ -f "${index_file}" ] || fail "index.html ausente em ${directory}"
  css_relative="$(extract_css_path "${index_file}")"
  [ -n "${css_relative}" ] || fail "referencia ao CSS ausente no index.html"
  css_file="${directory}/${css_relative}"
  css_bytes="$(validate_css_file "${css_file}")"
  echo "CSS local validado: ${css_relative} (${css_bytes} bytes)"
}

validate_url() {
  local url="$1"
  local temp_dir index_file css_relative css_url css_file css_bytes

  temp_dir="$(mktemp -d)"
  trap 'rm -rf "${temp_dir}"' RETURN
  index_file="${temp_dir}/index.html"

  curl -fsSL "${url}" -o "${index_file}" || fail "nao foi possivel acessar ${url}"
  css_relative="$(extract_css_path "${index_file}")"
  [ -n "${css_relative}" ] || fail "referencia ao CSS ausente na pagina publica"
  css_url="${url%/}/${css_relative}"
  css_file="${temp_dir}/frontend.css"
  curl -fsSL "${css_url}" -o "${css_file}" || fail "nao foi possivel acessar ${css_url}"
  css_bytes="$(validate_css_file "${css_file}")"
  echo "CSS publico validado: ${css_relative} (${css_bytes} bytes)"
}

usage() {
  echo "Uso: $0 directory <pasta> | url <endereco>" >&2
  exit 2
}

[ "$#" -eq 2 ] || usage

case "$1" in
  directory) validate_directory "$2" ;;
  url) validate_url "$2" ;;
  *) usage ;;
esac
