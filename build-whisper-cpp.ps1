# =====================================================================
# build-whisper-cpp.ps1 — binário de transcrição whisper.cpp com backend GPU
#   - AMD/Intel no Windows: backend Vulkan (usa a GPU de verdade)
#   - NVIDIA: backend CUDA (opcional; faster-whisper já cobre NVIDIA)
#
# Pré-requisitos instalados/verificados: cmake + MSVC Build Tools + Vulkan SDK.
# Reinstala o pywhispercpp recompilado com GGML_VULKAN=ON.
# =====================================================================
param(
    [switch]$SkipToolchainCheck  # pula instalação via winget (use se já tiver tudo)
)
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

function Have { param($n) [bool](Get-Command $n -ErrorAction SilentlyContinue) }
function Msg  { param($m) Write-Host "== $m ==" -ForegroundColor Cyan }

Msg "Build whisper.cpp (GPU Vulkan) para HiNoter-Lite"

if (-not $UseToolchainSkip) {
    if (-not (Have cmake)) {
        Msg "Instalando CMake via winget..."
        winget install Kitware.CMake --accept-source-agreements --accept-package-agreements --silent --disable-interactivity
    }
    if (-not (Test-Path 'C:\VulkanSDK')) {
        Msg "Instalando Vulkan SDK (KhronosGroup.VulkanSDK, ~1GB)..."
        winget install KhronosGroup.VulkanSDK --accept-source-agreements --accept-package-agreements --silent --disable-interactivity
    }
    $vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
    $hasMSVC = Test-Path $vswhere -and (& $vswhere -latest -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath)
    if (-not $hasMSVC) {
        Msg "Instalando MSVC Build Tools (VCTools)..."
        winget install Microsoft.VisualStudio.2022.BuildTools --override '--wait --quiet --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.VC.CMake.Project' --silent --disable-interactivity
        if ($LASTEXITCODE -ne 0) { Write-Error "Falha ao instalar Build Tools. Rode manualmente ou use -UseToolchainSkip." }
    }
}

Msg "Recompilando pywhispercpp com Vulkan (pode demorar)..."
$env:CMAKE_ARGS = "-DGGML_VULKAN=ON"
& ".venv\Scripts\python.exe" -m pip install --force-reinstall --no-cache-dir pywhispercpp
if ($LASTEXITCODE -ne 0) { Write-Error "Falha no pip install." }

Write-Host ""
Write-Host "OK. Agora rode .\run.ps1 — o /api/health deve reportar whisper.cpp/vulkan com a sua GPU AMD/Intel." -ForegroundColor Green