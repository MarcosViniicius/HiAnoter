#!/usr/bin/env bash
# =====================================================================
# HiAnoter-Lite · UM comando. Tudo pronto.
#   ./run.sh            -> instala o que faltar e abre em :8000
#   ./run.sh dev        -> backend :8000 + Vite :5173 (hot reload)
#   ./run.sh gpu        -> compila whisper.cpp p/ GPU (Vulkan) na 1ª vez
#   ./run.sh setup      -> força instalação do zero
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")"

MODE="${1:-}"
sink() { printf '\033[1;36m[ok]\033[0m %s\n' "$1"; }
warn() { printf '\033[33m[..]\033[0m %s\n' "$1"; }
fail() { printf '\033[31m[ER]\033[0m %s\n' "$1" >&2; exit 1; }

# 0) pré-requisitos
for tool in python3 node npm ffmpeg; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    fail "$tool nao encontrado. Instale-o e rode de novo. (mac: brew install $tool)"
  fi
done
sink "pré-requisitos ok (python3, node, npm, ffmpeg)"

# 1) venv
PY=".venv/bin/python3"
if [ ! -x "$PY" ]; then
  sink "criando venv..."
  python3 -m venv .venv
fi

# 2) deps
MARK=".venv/.hinoter-deps"
if [ "$MODE" = "setup" ] || [ ! -f "$MARK" ] || [ "$(cat "$MARK" 2>/dev/null)" != "$(md5sum < backend/requirements.txt | cut -d' ' -f1)" ]; then
  sink "instalando dependencias do backend (pode demorar)..."
  "$PY" -m pip install -q --upgrade pip
  "$PY" -m pip install -q -r backend/requirements.txt
  md5sum < backend/requirements.txt | cut -d' ' -f1 > "$MARK"
fi

if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  warn "backend/.env criado. Preencha OPENROUTER_API_KEY e NOTION_* (opcional) pra resumo/export. O menu tambem configura."
fi

# 3) frontend
if [ "$MODE" = "setup" ] || [ ! -f frontend/dist/index.html ]; then
  sink "buildando o frontend..."
  ( cd frontend && npm install --no-audit --no-fund >/dev/null && npm run build )
fi

# 4) GPU (opcional)
if [ "$MODE" = "gpu" ] && [ ! -f .venv/.vk-built ]; then
  sink "compilando whisper.cpp p/ GPU (Vulkan)... demora um pouco."
  ./build-whisper-cpp.sh vulkan && touch .venv/.vk-built || warn "build do Vulkan falhou; seguindo em CPU"
fi

# 5) roda
if [ "$MODE" = "dev" ]; then
  sink "DEV: backend :8000 + Vite :5173 (0.0.0.0)"
  ( cd backend && ../.venv/bin/python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload ) &
  BE=$!
  trap 'kill $BE 2>/dev/null || true' EXIT
  ( cd frontend && npm run dev )
  exit 0
fi

sink "HiNoter-Lite em http://0.0.0.0:8000  (Ctrl+C p/ parar)"
( cd backend && ../.venv/bin/python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 )