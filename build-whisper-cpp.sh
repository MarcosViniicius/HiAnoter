#!/usr/bin/env bash
# =====================================================================
# build-whisper-cpp.sh — recompila pywhispercpp com backend GPU
#   - AMD/Intel no Linux: GGML_VULKAN=ON (ou GGML_HIP=ON p/ ROCm AMD)
#   - NVIDIA: GGML_CUDA=ON (opcional; faster-whisper já cobre NVIDIA)
#   - macOS Apple Silicon: já é Metal no wheel — nada a fazer
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")"

say() { printf '\033[1;36m== %s ==\033[0m\n' "$1"; }

say "Build whisper.cpp (GPU) para HiNoter-Lite"

PY=".venv/bin/python3"
if [ ! -x "$PY" ]; then echo "venv ausente; rode ./setup.sh primeiro" >&2; exit 1; fi

BACKEND="${1:-vulkan}"   # vulkan | cuda | rock | metal

if [ "$(uname -s)" = "Darwin" ]; then
  say "macOS: wheel do pywhispercpp ja usa Metal. Nada a recompilar."
  exit 0
fi

case "$BACKEND" in
  vulkan)
    say "Verificando deps Vulkan (precisa de vulkan headers + glslc)..."
    command -v cmake >/dev/null || { say "cmake ausente"; exit 1; }
    export GGML_VULKAN=ON
    ;;
  cuda)
    export GGML_CUDA=ON
    ;;
  rocm)
    export GGML_HIP=ON
    ;;
  *) echo "opcao invalida: vulkan|cuda|rocm" ; exit 1 ;;
esac

say "Recompilando pywhispercpp com GGML_${BACKEND^^}..."
export CMAKE_ARGS="-DGGML_VULKAN=${GGML_VULKAN:-OFF} -DGGML_CUDA=${GGML_CUDA:-OFF} -DGGML_HIP=${GGML_HIP:-OFF}"
"$PY" -m pip install --force-reinstall --no-cache-dir pywhispercpp

printf '\033[1;32m\nOK. O /api/health deve reportar whisper.cpp/%s com a sua GPU.\033[0m\n' "$BACKEND"