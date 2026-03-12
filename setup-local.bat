@echo off
title Nasri Oracle — Local Setup
cd /d "%~dp0"
echo.
echo ============================================
echo  Nasri Oracle — Windows Setup
echo  Target: D:\Project-Nasri
echo ============================================
echo.
where powershell >nul 2>&1 && (
    powershell -ExecutionPolicy Bypass -File "%~dp0setup-local.ps1"
) || (
    echo PowerShell not found. Use WSL instead:
    echo   wsl -e bash -c "cd /mnt/d/Project-Nasri/Nasri-oracle && bash setup-local.sh"
)
pause
