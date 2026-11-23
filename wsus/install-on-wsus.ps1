<#
.SYNOPSIS
    Zero-dev-tool installer for WsusRestApi on a Production WSUS Server (Port 8530 /wsus-api).
    Uses only built-in Windows Server .NET Framework 4.8 (csc.exe), IIS, and WSUS API DLLs.
    No Visual Studio, MSBuild, or NuGet required.
#>

[CmdletBinding()]
param(
    [string]$SiteName = "WSUS Administration",
    [string]$AppPath = "/wsus-api",
    [string]$AppPoolName = "WsusRestApiPool",
    [string]$InstallDir = "C:\inetpub\wsus-api",
    [int]$Port = 8530
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$msg) {
    Write-Host "[*] $msg" -ForegroundColor Cyan
}

function Write-Ok([string]$msg) {
    Write-Host "[OK] $msg" -ForegroundColor Green
}

function Write-Warn([string]$msg) {
    Write-Host "[WARN] $msg" -ForegroundColor Yellow
}

# 1. Admin check
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Please run this script as Administrator."
}

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$SourceDir = Join-Path $ScriptRoot "WsusRestApi"
if (-not (Test-Path $SourceDir)) {
    throw "Application folder not found: $SourceDir"
}

# 2. Load IIS module
Write-Step "Checking IIS WebAdministration module..."
if (-not (Get-Module -ListAvailable -Name WebAdministration)) {
    throw "IIS WebAdministration PowerShell module is not installed. Ensure IIS Management Scripts and Tools are enabled."
}
Import-Module WebAdministration

# 3. Verify WSUS API DLL and built-in .NET Framework 4.8 csc.exe
$WsusApiDll = "C:\Program Files\Update Services\Api\Microsoft.UpdateServices.Administration.dll"
if (-not (Test-Path $WsusApiDll)) {
    throw "WSUS API DLL not found at '$WsusApiDll'. Run this installer on a WSUS Server."
}

$DotNetDir = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319"
$CscExe = Join-Path $DotNetDir "csc.exe"
if (-not (Test-Path $CscExe)) {
    throw ".NET Framework 4.8 compiler not found at '$CscExe'."
}
Write-Ok "Found WSUS API DLL and .NET Framework 4.8 runtime."

# 4. Deploy runtime config & Global.asax to InstallDir
Write-Step "Deploying runtime files to $InstallDir..."
$BinDir = Join-Path $InstallDir "bin"
$LogsDir = Join-Path $InstallDir "App_Data\Logs"
New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null

Copy-Item -Path (Join-Path $SourceDir "Global.asax") -Destination $InstallDir -Force
Copy-Item -Path (Join-Path $SourceDir "Web.config") -Destination $InstallDir -Force
Copy-Item -Path (Join-Path $SourceDir "Config") -Destination $InstallDir -Recurse -Force

# 5. Compile WsusRestApi.dll directly using built-in .NET 4.8 csc.exe (zero dev tools needed)
Write-Step "Compiling WsusRestApi.dll using built-in .NET Framework 4.8..."
$CsFiles = Get-ChildItem -Path $SourceDir -Recurse -Filter "*.cs" | ForEach-Object { $_.FullName }
$OutDll = Join-Path $BinDir "WsusRestApi.dll"

$cscArgs = @(
    "/nologo",
    "/target:library",
    "/optimize+",
    "/out:$OutDll",
    "/r:$DotNetDir\System.dll",
    "/r:$DotNetDir\System.Core.dll",
    "/r:$DotNetDir\System.Configuration.dll",
    "/r:$DotNetDir\System.Runtime.Caching.dll",
    "/r:$DotNetDir\System.Web.dll",
    "/r:$DotNetDir\System.Web.Extensions.dll",
    "/r:$WsusApiDll"
) + $CsFiles

$cscOutput = & $CscExe @cscArgs 2>&1
if ($LASTEXITCODE -ne 0) {
    $cscOutput | ForEach-Object { Write-Host $_ -ForegroundColor Red }
    throw "Compilation failed with exit code $LASTEXITCODE."
}
Write-Ok "Compiled $OutDll."

# 6. Locate target IIS Site (WSUS Administration on Port 8530)
Write-Step "Locating IIS site '$SiteName' (Port $Port)..."
$targetSite = Get-Website -Name $SiteName -ErrorAction SilentlyContinue
if (-not $targetSite) {
    $targetSite = Get-Website | Where-Object {
        $_.Bindings.Collection | Where-Object { $_.bindingInformation -match ":${Port}:" }
    } | Select-Object -First 1
}

if (-not $targetSite) {
    throw "Could not find IIS site '$SiteName' or any site bound to port $Port."
}
$resolvedSiteName = $targetSite.Name
Write-Ok "Target IIS site: '$resolvedSiteName'"

# 7. Collision check against existing WSUS endpoints
$wsusReservedPaths = @(
    "/ClientWebService", "/SimpleAuthWebService", "/ServerSyncWebService",
    "/ApiRemoting30", "/ReportingWebService", "/DssAuthWebService",
    "/Content", "/Selfupdate", "/Inventory", "/iuident.cab"
)
if ($wsusReservedPaths -contains $AppPath) {
    throw "AppPath '$AppPath' collides with a built-in WSUS endpoint!"
}

$existingVdirs = Get-WebVirtualDirectory -Site $resolvedSiteName -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -eq $AppPath }
if ($existingVdirs) {
    throw "Virtual directory '$AppPath' already exists under '$resolvedSiteName'. Choose a different AppPath."
}

# 8. Create isolated 64-bit .NET v4.0 AppPool
Write-Step "Configuring isolated AppPool '$AppPoolName'..."
if (-not (Test-Path "IIS:\AppPools\$AppPoolName")) {
    New-WebAppPool -Name $AppPoolName | Out-Null
}
Set-ItemProperty "IIS:\AppPools\$AppPoolName" -Name managedRuntimeVersion -Value "v4.0"
Set-ItemProperty "IIS:\AppPools\$AppPoolName" -Name managedPipelineMode -Value "Integrated"
Set-ItemProperty "IIS:\AppPools\$AppPoolName" -Name enable32BitAppOnWin64 -Value $false
Set-ItemProperty "IIS:\AppPools\$AppPoolName" -Name processModel.identityType -Value "ApplicationPoolIdentity"
Write-Ok "AppPool '$AppPoolName' configured."

# 9. Add AppPool identity to local "WSUS Reporters" group for read-only WSUS access
$appPoolIdentity = "IIS AppPool\$AppPoolName"
Write-Step "Granting read-only WSUS access ($appPoolIdentity -> WSUS Reporters)..."
try {
    $wsusReporters = Get-LocalGroup -Name "WSUS Reporters" -ErrorAction SilentlyContinue
    if ($wsusReporters) {
        $members = Get-LocalGroupMember -Group "WSUS Reporters" -ErrorAction SilentlyContinue
        if (-not ($members | Where-Object { $_.Name -like "*$AppPoolName" })) {
            Add-LocalGroupMember -Group "WSUS Reporters" -Member $appPoolIdentity
            Write-Ok "Added '$appPoolIdentity' to 'WSUS Reporters'."
        } else {
            Write-Ok "'$appPoolIdentity' is already a member of 'WSUS Reporters'."
        }
    } else {
        Write-Warn "Local group 'WSUS Reporters' not found. Ensure the AppPool identity has read access to WSUS."
    }
} catch {
    Write-Warn "Could not update 'WSUS Reporters' group automatically: $($_.Exception.Message)"
}

# 10. Grant NTFS permissions on InstallDir & App_Data\Logs
Write-Step "Setting NTFS permissions..."
& icacls $InstallDir /grant "${appPoolIdentity}:(OI)(CI)RX" /T /Q | Out-Null
& icacls $LogsDir /grant "${appPoolIdentity}:(OI)(CI)M" /T /Q | Out-Null
Write-Ok "NTFS permissions applied."

# 11. Create or update IIS Application /wsus-api under WSUS Administration
$appNameWithoutSlash = $AppPath.TrimStart('/')
Write-Step "Registering IIS Application '$AppPath' under '$resolvedSiteName'..."
$existingApp = Get-WebApplication -Site $resolvedSiteName -Name $appNameWithoutSlash -ErrorAction SilentlyContinue
if ($existingApp) {
    Set-ItemProperty "IIS:\Sites\$resolvedSiteName\$appNameWithoutSlash" -Name physicalPath -Value $InstallDir
    Set-ItemProperty "IIS:\Sites\$resolvedSiteName\$appNameWithoutSlash" -Name applicationPool -Value $AppPoolName
    Write-Ok "Updated existing IIS Application '$AppPath'."
} else {
    New-WebApplication -Site $resolvedSiteName -Name $appNameWithoutSlash -PhysicalPath $InstallDir -ApplicationPool $AppPoolName | Out-Null
    Write-Ok "Created IIS Application '$AppPath'."
}

# 12. Verify health endpoint
$healthUrl = "http://localhost:$Port$AppPath/api/v1/health"
Write-Step "Testing health endpoint: $healthUrl"
Start-Sleep -Seconds 2
try {
    $resp = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 15
    if ($resp.success) {
        Write-Ok "Health check passed! Status: $($resp.data.status), ReadOnly: $($resp.data.readOnly)"
    } else {
        Write-Warn "Health endpoint responded with success=false."
    }
} catch {
    Write-Warn "Health check request failed: $($_.Exception.Message)"
    Write-Warn "Check Event Viewer or $LogsDir for details."
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host " WSUS REST API Base URL : http://$($env:COMPUTERNAME):$Port$AppPath/api/v1" -ForegroundColor White
Write-Host " Health Endpoint        : $healthUrl" -ForegroundColor White
Write-Host " API Security Config    : $InstallDir\Config\security.json" -ForegroundColor White
Write-Host " WSUS Settings Config   : $InstallDir\Config\Wsus\wsus-settings.json" -ForegroundColor White
Write-Host "============================================================" -ForegroundColor Green
