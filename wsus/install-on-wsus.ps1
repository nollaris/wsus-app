<#
.SYNOPSIS
    Installs WsusRestApi as an isolated IIS Application (/wsus-api) under the existing
    "WSUS Administration" IIS site on Port 8530 without colliding with WSUS endpoints.

.DESCRIPTION
    - Verifies Administrator & IIS WebAdministration module
    - Builds WsusRestApi (if bin\WsusRestApi.dll is not already present)
    - Creates an isolated 64-bit .NET v4.0 AppPool (WsusRestApiPool)
    - Adds the AppPool identity to local "WSUS Reporters" group (read-only WSUS access)
    - Registers IIS Application "/wsus-api" under "WSUS Administration" (Port 8530)
    - Verifies /wsus-api does not collide with existing WSUS virtual directories
    - Grants write permissions on App_Data\Logs for NLog
    - Runs a health check against http://localhost:8530/wsus-api/api/v1/health
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
$ProjectDir = Join-Path $ScriptRoot "WsusRestApi"
$SolutionFile = Join-Path $ScriptRoot "WsusRestApi.sln"

if (-not (Test-Path $ProjectDir)) {
    throw "Project folder not found: $ProjectDir"
}

# 2. Load IIS module
Write-Step "Checking IIS WebAdministration module..."
if (-not (Get-Module -ListAvailable -Name WebAdministration)) {
    throw "IIS WebAdministration PowerShell module is not installed. Ensure IIS Management Scripts and Tools are enabled."
}
Import-Module WebAdministration

# 3. Ensure WSUS API DLL exists on host
$WsusApiDll = "C:\Program Files\Update Services\Api\Microsoft.UpdateServices.Administration.dll"
if (-not (Test-Path $WsusApiDll)) {
    throw "WSUS API DLL not found at '$WsusApiDll'. Run this installer on a WSUS Server or host with WSUS Administration Console installed."
}
Write-Ok "Found WSUS API DLL."

# 4. Build project if bin\WsusRestApi.dll is missing
$BuiltDll = Join-Path $ProjectDir "bin\WsusRestApi.dll"
if (-not (Test-Path $BuiltDll)) {
    Write-Step "Compiled binary not found. Attempting NuGet restore & MSBuild..."

    $nuget = Get-Command nuget.exe -ErrorAction SilentlyContinue
    if ($nuget) {
        & $nuget.Source restore $SolutionFile
        if ($LASTEXITCODE -ne 0) { throw "NuGet restore failed." }
    } else {
        Write-Warn "nuget.exe not found on PATH. Assuming packages\ is already restored."
    }

    $msbuildPaths = @(
        "${env:ProgramFiles}\Microsoft Visual Studio\2022\BuildTools\MSBuild\Current\Bin\MSBuild.exe",
        "${env:ProgramFiles}\Microsoft Visual Studio\2022\Community\MSBuild\Current\Bin\MSBuild.exe",
        "${env:ProgramFiles}\Microsoft Visual Studio\2022\Professional\MSBuild\Current\Bin\MSBuild.exe",
        "${env:ProgramFiles}\Microsoft Visual Studio\2022\Enterprise\MSBuild\Current\Bin\MSBuild.exe",
        "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2019\BuildTools\MSBuild\Current\Bin\MSBuild.exe",
        "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\MSBuild.exe"
    )
    $msbuild = $msbuildPaths | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $msbuild) {
        throw "MSBuild.exe not found. Build WsusRestApi.sln in Visual Studio first or install Build Tools."
    }

    & $msbuild $SolutionFile /p:Configuration=Release /m
    if ($LASTEXITCODE -ne 0) { throw "MSBuild failed." }
    Write-Ok "Build succeeded."
} else {
    Write-Ok "Using existing compiled binaries in $ProjectDir\bin"
}

# 5. Copy application files to InstallDir (preserves existing Web.config / wsus-servers.json if already deployed? No, copies fresh & warns if needed)
Write-Step "Deploying files to $InstallDir..."
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null

$robocopyArgs = @(
    $ProjectDir,
    $InstallDir,
    "/E",
    "/XD", "obj", "Properties", ".vs",
    "/XF", "*.cs", "*.csproj", "*.csproj.user"
)
& robocopy @robocopyArgs | Out-Null
if ($LASTEXITCODE -ge 8) {
    throw "Robocopy failed with exit code $LASTEXITCODE"
}

$LogsDir = Join-Path $InstallDir "App_Data\Logs"
New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null
Write-Ok "Files deployed to $InstallDir."

# 6. Locate target IIS Site (WSUS Administration on Port 8530)
Write-Step "Locating IIS site '$SiteName' (Port $Port)..."
$targetSite = Get-Website -Name $SiteName -ErrorAction SilentlyContinue
if (-not $targetSite) {
    # Fallback: find any site bound to port 8530
    $targetSite = Get-Website | Where-Object {
        $_.Bindings.Collection | Where-Object { $_.bindingInformation -match ":$Port:" }
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
Write-Host " Next.js Config         : $InstallDir\Config\NextJs\nextjs-client.json" -ForegroundColor White
Write-Host " WSUS Servers Config    : $InstallDir\Config\Wsus\wsus-servers.json" -ForegroundColor White
Write-Host " WSUS Settings Config   : $InstallDir\Config\Wsus\wsus-settings.json" -ForegroundColor White
Write-Host "============================================================" -ForegroundColor Green
