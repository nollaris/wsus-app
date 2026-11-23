@echo off
setlocal
:: Double-click installer for WSUS REST API on the target WSUS Server (Port 8530 /wsus-api)

:: Check for Administrator privileges; self-elevate via UAC if needed
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting Administrator privileges...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo ============================================================
echo   WSUS REST API Installer (Port 8530 - /wsus-api)
echo ============================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-on-wsus.ps1"
set EXIT_CODE=%errorlevel%

echo.
if %EXIT_CODE% equ 0 (
    echo [SUCCESS] Installation completed.
) else (
    echo [FAILED] Installation exited with code %EXIT_CODE%.
)
pause
exit /b %EXIT_CODE%
