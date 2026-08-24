#!/usr/bin/env bash
# Setup nativo do HiNoter-Lite (Linux/macOS)
set -euo pipefail
cd "$(dirname "$0")"

say()  { printf '\033[1;36m== %s ==\033[0m\n' "$1"; }
ok()   { printf '\033[32m[ok]\033[0m %s\n' "$1"; }
warn() { printf '\033[33m[..]\033[0m %s\n' "$1"; }
err()  { printf '\033[31m[ER]\033[0m %s\n' "$1" >&2; }

# --- Python 3.11+ ---------------------------------------------------------
if ! command -v python3 >/dev/null 2>&1; then err "python3 nao encontrado."; exit 1; fi
V=$(python3 --version); ok "Python: $V"

# --- Node 18+ ---------------------------------------------------------------
for cmd in node npm; do
  command -v "$cmd" >/dev/null 2>&1 || { err "$cmd nao encontrado (instale Node 18+: https://nodejs.org)."; exit 1; }
done
ok "node/npm encontrados"

# --- ffmpeg --------------------------------------------------------------------
command -v ffmpeg >/dev/null 2>&1 || {
  err "ffmpeg nao encontrado. Instale com 'brew install ffmpeg' (mac) ou 'sudo apt install ffmpeg' (Debian/Ubuntu)."
  exit 1
}
ok "ffmpeg encontrado"

# --- GPU informativo -------------------------------------------------------------
if command -v nvidia-smi >/dev/null 2>&1; then
  ok "GPU NVIDIA detectada: $(nvidia-smi --query-gpu=name --format=csv,noheader | head -1) (CUDA/faster-whisper)"
elif lspci 2>/dev/null | grep -qiE 'amd|radeon|intel'; then
  warn "GPU nao-NVIDIA detectada via lspci. Rode ./build-whisper-cpp.sh vulkan para aceleração via whisper.cpp."
else
  warn "Sem GPU detectada; o app roda em CPU/int8."
fi

# --- DATA_DIR ----------------------------------------------------------------------
mkdir -p "$HOME/.hinoter-lite/data"
ok "DATA_DIR garantido em $HOME/.hinoter-lite/data"

# --- venv -----------------------------------------------------------------------------
if [ ! -x .venv/bin/python3 ]; then
  python3 -m venv .venv
fi
PY=".venv/bin/python3"
ok "venv pronto"

$PY -m pip install --upgrade pip >/dev/null
$PY -m pip install -r backend/requirements.txt
say "backend instalado"

if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  warn "backend/.env criado. Preencha OPENROUTER_API_KEY e as chaves de Notion."
else
  ok "backend/.env ja existe (mantido)"
fi

# --- Frontend ----------------------------------------------------------------------------
(cd frontend && npm install --no-audit --no-fund && npm run build)
ok "frontend buildado em frontend/dist"

printf '\033[1;32m\nSetup concluido! Rode: ./run.sh\033[0m\n'