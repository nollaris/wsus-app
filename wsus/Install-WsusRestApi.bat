@echo off
setlocal
:: Double-click installer for WSUS REST API on the target WSUS Server (Port 8530 /wsus-api)
:: Runs without PowerShell using built-in .NET Framework 4.8 (csc.exe) and IIS appcmd.exe.

set "DOTNET_DIR=%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319"
set "CSC_EXE=%DOTNET_DIR%\csc.exe"
set "INSTALLER_SRC=%~dp0Install-WsusRestApi.cs"
set "INSTALLER_EXE=%TEMP%\WsusRestApiInstaller.exe"

if not exist "%CSC_EXE%" (
    echo [ERROR] .NET Framework 4.8 compiler not found at "%CSC_EXE%".
    pause
    exit /b 1
)

if not exist "%INSTALLER_SRC%" (
    echo [ERROR] Installer source not found at "%INSTALLER_SRC%".
    pause
    exit /b 1
)

echo ============================================================
echo   WSUS REST API Installer (Port 8530 - /wsus-api)
echo ============================================================
echo.
echo [*] Preparing native .NET 4.8 installer (no PowerShell required)...

"%CSC_EXE%" /nologo /target:exe /platform:x64 /optimize+ ^
    /out:"%INSTALLER_EXE%" ^
    /r:"%DOTNET_DIR%\System.dll" ^
    /r:"%DOTNET_DIR%\System.Core.dll" ^
    /r:"%DOTNET_DIR%\System.Xml.dll" ^
    /r:"%DOTNET_DIR%\System.Web.Extensions.dll" ^
    /r:"%DOTNET_DIR%\Microsoft.CSharp.dll" ^
    "%INSTALLER_SRC%"

if %errorlevel% neq 0 (
    echo [FAILED] Could not compile installer.
    pause
    exit /b %errorlevel%
)

net session >nul 2>&1
if %errorlevel% equ 0 (
    set "IS_ADMIN=1"
) else (
    set "IS_ADMIN=0"
)

"%INSTALLER_EXE%" --source "%~dp0WsusRestApi" %*
set "EXIT_CODE=%errorlevel%"

if "%IS_ADMIN%"=="1" (
    echo.
    if %EXIT_CODE% equ 0 (
        echo [SUCCESS] Installation completed.
    ) else (
        echo [FAILED] Installation exited with code %EXIT_CODE%.
    )
    pause
) else if %EXIT_CODE% neq 0 (
    echo.
    echo [FAILED] Installation exited with code %EXIT_CODE%.
    pause
)

exit /b %EXIT_CODE%
