# Setup nativo do HiaNoter-Lite (Windows)
# Checa dependencias, cria venv, instala backend + frontend e prepara backend/.env
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)

function Check-Tool {
    param([string]$Name, [string]$VersionCmd, [string]$Hint)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        Write-Host "[ERRO] $Name nao encontrado. $Hint" -ForegroundColor Red
        return $false
    }
    Write-Host "[ok] $Name instalado" -ForegroundColor Green
    return $true
}

Write-Host ""
Write-Host "== HiaNoter-Lite :: setup (execucao nativa) ==" -ForegroundColor Cyan

# --- Python 3.11+ -------------------------------------------------------
if (-not (Check-Tool "python" "python --version" "Instale o Python 3.11+ de python.org (marque 'Add to PATH').")) {
    exit 1
}
$pyVersion = & python --version 2>&1
Write-Host "     -> versao: $pyVersion"

# --- Node 18+ ------------------------------------------------------------
if (-not (Check-Tool "node" "node --version" "Instale o Node.js 18+: https://nodejs.org")) {
    exit 1
}
if (-not (Check-Tool "npm" "npm --version" "")) {
    Write-Host "[ER] npm nao encontrado (vem junto com o Node.js)." -ForegroundColor Red
    exit 1
}

# --- ffmpeg ---------------------------------------------------------------
if (-not (Check-Tool "ffmpeg" "ffmpeg -version" "Instale com 'choco install ffmpeg' ou baixe de gyan.dev.")) {
    exit 1
}

# --- GPU (informativo, nao bloqueante) ------------------------------------
$gpuInfo = Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name
if ($gpuInfo) {
    Write-Host "[ok] GPU(s) detectada(s): $($gpuInfo -join ' | ')" -ForegroundColor Green
    if ($gpuInfo -match 'NVIDIA') {
        Write-Host "     NVIDIA => faster-whisper via CUDA (acelerado)" -ForegroundColor Green
    } elseif ($gpuInfo -match 'Radeon|AMD|Intel') {
        Write-Host "     AMD/Intel => whisper.cpp via Vulkan (GPU). Rode .\build-whisper-cpp.ps1 para compilar o backend Vulkan." -ForegroundColor Yellow
    }
} else {
    Write-Host "[..] nenhuma GPU detectada pela WMI; transcrevendo em CPU/int8." -ForegroundColor Yellow
}

# --- Data dir ----------------------------------------------------------------
$dataDir = Join-Path $HOME ".hinoter-lite\data"
New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
Write-Host "[ok] DATA_DIR garantido em $dataDir" -ForegroundColor Green

# --- venv ---------------------------------------------------------------------
if (-not (Test-Path ".venv\Scripts\python.exe")) {
    Write-Host "Criando ambiente virtual Python..." -ForegroundColor Yellow
    python -m venv .venv
}
if (-not (Test-Path ".venv\Scripts\python.exe")) {
    Write-Host "[ER] Falha ao criar .venv" -ForegroundColor Red
    exit 1
}
Write-Host "[ok] venv pronto" -ForegroundColor Green

# --- Backend deps ---------------------------------------------------------------
Write-Host "Instalando dependencias do backend (pode demorar, inclui faster-whisper)..." -ForegroundColor Yellow
& ".venv\Scripts\python.exe" -m pip install --upgrade pip
& ".venv\Scripts\python.exe" -m pip install -r backend\requirements.txt
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ER] Falha ao instalar dependencias Python." -ForegroundColor Red
    exit 1
}

# --- Env config -----------------------------------------------------------------
if (-not (Test-Path "backend\.env")) {
    Copy-Item "backend\.env.example" "backend\.env"
    Write-Host "[ok] backend\.env criado a partir do exemplo. Abra e preencha as chaves OPENROUTER e NOTION." -ForegroundColor Yellow
} else {
    Write-Host "[ok] backend/.env ja existe (mantido)" -ForegroundColor Green
}

# --- Frontend -----------------------------------------------------------------------
Write-Host "Instalando e buildando o frontend..." -ForegroundColor Yellow
Push-Location frontend
npm install --no-audit --no-fund
npm run build
if ($LASTEXITCODE -ne 0) {
    Pop-Location
    Write-Host "[ER] Falha no build do frontend." -ForegroundColor Red
    exit 1
}
Pop-Location
Write-Host "[ok] frontend buildado em frontend/dist" -ForegroundColor Green

Write-Host ""
Write-Host "Setup concluido! Para rodar: .\run.ps1  (abrindo em http://localhost:8000)" -ForegroundColor Green
Write-Host "Dev com hot reload do frontend: `n  .\run.ps1 -Dev  (Vite em :5173 proxando /api para :8000)" -ForegroundColor Cyan