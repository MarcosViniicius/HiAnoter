@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1" %*
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Ocorreu um erro na execucao do HiAnoter.
    pause
)
