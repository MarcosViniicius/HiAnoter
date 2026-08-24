# =====================================================================
# HiAnoter-Lite · UM comando. Tudo pronto.
#   .\run.ps1            -> instala o que faltar (venv, deps, frontend,
#                           ffmpeg, chave do .env) e abre em :8000
#   .\run.ps1 -Dev       -> backend :8000 + Vite :5173 (hot reload)
#   .\run.ps1 -Gpu       -> também compila a engine whisper.cpp p/ GPU
#                           (AMD/Intel Vulkan) na primeira vez
#   .\run.ps1 -Setup     -> força instalação do zero (venv/deps/builds)
# =====================================================================
param(
    [switch]$Dev,
    [switch]$Gpu,
    [switch]$Setup,
    [switch]$NoBrowser,
    [string]$HostAddress = "0.0.0.0",
    [int]$Port = 8000
)
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)

function Have-Tool { param($n) [bool](Get-Command $n -ErrorAction SilentlyContinue) }
function Refresh-Path {
    $env:PATH = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [Environment]::GetEnvironmentVariable("Path", "User")
}

# 0) --- pré-requisitos + instalação automática quando possível -----------
Refresh-Path
if (-not (Have-Tool python)) {
    if (Have-Tool winget) {
        Write-Host "[ok] Python ausente; instalando via winget..." -ForegroundColor Yellow
        winget install --id Python.Python.3.12 -e --silent --accept-source-agreements --accept-package-agreements --disable-interactivity
        Refresh-Path
    } else {
        Write-Host "[ER] Python 3.11+ necessario. Instale em https://python.org e rode de novo." -ForegroundColor Red
        exit 1
    }
}
if (-not (Have-Tool node)) {
    if (Have-Tool winget) {
        Write-Host "[ok] Node.js ausente; instalando via winget..." -ForegroundColor Yellow
        winget install --id OpenJS.NodeJS.LTS -e --silent --accept-source-agreements --accept-package-agreements --disable-interactivity
        Refresh-Path
    } else {
        Write-Host "[ER] Node 18+ necessario. Instale em https://nodejs.org e rode de novo." -ForegroundColor Red
        exit 1
    }
}
if (-not (Have-Tool ffmpeg)) {
    if (Have-Tool winget) {
        Write-Host "[ok] ffmpeg ausente; instalando via winget..." -ForegroundColor Yellow
        winget install --id Gyan.FFmpeg -e --silent --accept-source-agreements --accept-package-agreements --disable-interactivity | Out-Null
        Refresh-Path
    } else {
        Write-Host "[..] ffmpeg nao encontrado. Instale com choco ou gyan.dev." -ForegroundColor Yellow
    }
}
if (-not (Have-Tool ffmpeg)) {
    # winget instala no perfil do usuario; garante o PATH atual desta sessao
    $g = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Gyan.FFmpeg*\ffmpeg-*\bin" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($g) { $env:PATH = "$($g.FullName);$env:PATH" }
}

# 1) --- venv -------------------------------------------------------------------
if (-not (Test-Path ".venv\Scripts\python.exe")) {
    Write-Host "[ok] criando ambiente virtual Python..." -ForegroundColor Yellow
    python -m venv .venv
}
$py = ".venv\Scripts\python.exe"

# 2) --- dependencias do backend (instala nas 1ª vez / -Setup) -------------------
$marker = ".venv\.hinoter-deps"
$reqHash = (Get-FileHash "backend\requirements.txt" -Algorithm MD5).Hash
$needInstall = $Setup -or (-not (Test-Path $marker)) -or ((Get-Content $marker -Raw -ErrorAction:SilentlyContinue) -ne $reqHash)
if ($needInstall) {
    Write-Host "[ok] instalando dependencias do backend (pode demorar)..." -ForegroundColor Yellow
    & $py -m pip install -q --upgrade pip
    & $py -m pip install -q -r "backend\requirements.txt"
    if ($LASTEXITCODE -ne 0) { Write-Host "[ER] falha ao instalar dependencias." -ForegroundColor Red; exit 1 }
    Set-Content -Path $marker -Value $reqHash
}
if (-not (Test-Path "backend\.env")) {
    Copy-Item "backend\.env.example" "backend\.env"
    Write-Host ""
    Write-Host "====================================================================================" -ForegroundColor Cyan
    Write-Host " 1º passo: abra backend\.env e preencha (opcional) as chaves reais:" -ForegroundColor White
    Write-Host "    OPENROUTER_API_KEY=sk-or-v1-...   (resumo em IA)" -ForegroundColor Gray
    Write-Host "    NOTION_API_KEY=secret_...        (exportar p/ Notion)" -ForegroundColor Gray
    Write-Host "  Sem elas o upload/transcricao funcionam; so o resumo/export pedem chave." -ForegroundColor DarkGray
    Write-Host "  (Também dá pra configurar tudo pelo menu na interface.)" -ForegroundColor DarkGray
    Write-Host "====================================================================================" -ForegroundColor Cyan
}

# 3) --- frontend (builda se dist ausente ou -Setup) --------------------------------
$dist = "frontend\dist\index.html"
if ($Setup -or -not (Test-Path $dist)) {
    Write-Host "[ok] buildando o frontend..." -ForegroundColor Yellow
    Push-Location frontend
    try { npm install --no-audit --no-fund | Out-Null; npm run build }
    finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { Write-Host "[ERRO] falha no build do frontend." -ForegroundColor Red; exit 1 }
}

# 4) --- GPU (opcional, compila whisper.cpp Vulkan/CUDA na 1ª vez) ------------------
if ($Gpu -and -not (Test-Path ".venv\.vk-built")) {
    Write-Host "[ok] compilando whisper.cpp p/ GPU (Vulkan)... demora e baixa ~1GB." -ForegroundColor Yellow
    & .\build-whisper-cpp.ps1 -SkipToolchainCheck
    if ($LASTEXITCODE -eq 0) { Set-Content ".venv\.vk-built" "1" } else {
        Write-Host "[..] build do Vulkan falhou; o app seguira em CPU por ora." -ForegroundColor Yellow
    }
}

# 5) --- roda ---------------------------------------------------------------------
# Obter IPs locais para exibir na inicializacao
$localIps = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" }).IPAddress

if ($Dev) {
    Write-Host "Modo DEV: backend :8000 + Vite :5173 (hot reload)" -ForegroundColor Cyan
    Write-Host "Acessivel na rede local:" -ForegroundColor Gray
    foreach ($ip in $localIps) {
        Write-Host "  -> http://${ip}:5173  (Frontend Vite)" -ForegroundColor Green
        Write-Host "  -> http://${ip}:8000  (Backend API)" -ForegroundColor DarkGray
    }
    Write-Host ""
    $be = Start-Process -FilePath $py -ArgumentList "-m","uvicorn","app.main:app","--host",$HostAddress,"--port","8000","--reload" `
        -WorkingDirectory (Join-Path $PWD "backend") -NoNewWindow -PassThru `
        -RedirectStandardOutput dev-backend.out.log -RedirectStandardError dev-backend.err.log
    Push-Location frontend
    try { npm run dev } finally { Pop-Location; Stop-Process -Id $be.Id -Force -ErrorAction SilentlyContinue }
    return
}

if (-not $NoBrowser) { Start-Process "http://localhost:$Port" }
Write-Host "HiNoter-Lite rodando em http://localhost:$Port" -ForegroundColor Green
if ($HostAddress -eq "0.0.0.0") {
    Write-Host "Acessivel de outras maquinas na mesma rede:" -ForegroundColor Cyan
    foreach ($ip in $localIps) {
        Write-Host "  -> http://${ip}:$Port" -ForegroundColor Yellow
    }
}
Write-Host "(Ctrl+C para parar)" -ForegroundColor DarkGray
Set-Location backend
& "..\.venv\Scripts\python.exe" -m uvicorn app.main:app --host $HostAddress --port $Port