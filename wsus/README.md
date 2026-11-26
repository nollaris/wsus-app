# WSUS Local REST API (Production Server Only)

REST API designed to be installed on each **WSUS Server**. It connects exclusively to the **Local WSUS Service** on that host (`AdminProxy.GetUpdateServer()`), performs no remote calls to other servers, and **requires no developer tools or PowerShell**. Read operations are available by default; write operations require the explicit installer option `--enable-write-operations`.

## Key Features

- **Local WSUS Only**: Connects solely to the WSUS service on the host where it is installed.
- **Zero Dev Tools & No PowerShell Required**: Uses built-in Windows Server `.NET Framework 4.8` (`csc.exe`), IIS `Microsoft.Web.Administration.dll`, and `Microsoft.UpdateServices.Administration.dll` directly—no Visual Studio, MSBuild, NuGet, or PowerShell required.
- **Non-Colliding Port 8530 Hosting**: Installs as an IIS sub-application at `/wsus-api` under the `WSUS Administration` site with an isolated AppPool (`WsusRestApiPool`), avoiding collisions with built-in WSUS endpoints.
- **5-Minute Refresh & Caching**: `MemoryCache` with a 5-minute TTL and a 5-minute background refresh interval.
- **Restricted Write Access**: Allows read requests and selected `POST` controls. The default installation grants only `WSUS Reporters`; opt in to write operations with `--enable-write-operations`, which adds the AppPool identity to `WSUS Administrators`.
- **Post-install verification**: Attempts and verifies the AppPool's `WSUS Reporters` membership, refreshes its worker process, and tests authenticated access to the local WSUS summary. A healthy `/health` response alone does not confirm WSUS data access.
- **Configuration**:
  - `Config/security.json` — `authEnabled`, `apiKeys`, `bearerTokens`, `allowedOrigins`
  - `Config/Wsus/wsus-settings.json` — `serverId`, `serverName`, `cacheDurationMinutes`, `enableBackgroundRefresh`, `maxSyncHistoryItems`
- **Logging**: Writes daily logs to `App_Data/Logs/wsus-api-YYYY-MM-DD.log`

## Endpoints

Base URL: `http://<wsus-host>:8530/wsus-api/api/v1`

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/api/v1/health` | Health check, local server identity, uptime, last refresh |
| `GET` | `/api/v1/summary` | Summary of the local WSUS server |
| `GET` | `/api/v1/computers` | Paginated & filterable computers (`search`, `group`, `os`, `status`, `page`, `pageSize`) |
| `GET` | `/api/v1/computers/{computerId}` | Computer details + needed/failed/pendingReboot/installed updates |
| `GET` | `/api/v1/updates` | Paginated & filterable updates (`search`, `classification`, `severity`, `approved`, `declined`, `kb`, `page`, `pageSize`) |
| `GET` | `/api/v1/updates/{updateId}` | Update details, description, approvals, and per-computer status |
| `GET` | `/api/v1/groups` | Computer target groups with compliance summary |
| `GET` | `/api/v1/groups/{groupId}` | Target group details + member computers |
| `GET` | `/api/v1/sync` | Sync settings, current sync status, and history (`limit`) |
| `POST` | `/api/v1/groups` | Create a computer group (`{"name":"Pilot"}`) |
| `POST` | `/api/v1/groups/{groupId}/computers` | Add a computer (`{"computerId":"..."}`) to a group |
| `POST` | `/api/v1/sync` | Start WSUS upstream synchronization |
| `POST` | `/api/v1/updates/{updateId}/approvals` | Approve an update for installation (`{"revisionNumber":1,"targetGroupId":"..."}`); no installation deadline is set |

These controls do not expose endpoints to decline updates, remove computers, or delete groups. Approval scheduling is managed by the portal and requires the `WsusApprovalSchedule` database migration and a persistent Node.js server so its in-process scheduler can run.

## One-Click Install on WSUS Server

1. Copy the `wsus/` folder to the target **WSUS Server**.
2. Double-click **[Install-WsusRestApi.bat](Install-WsusRestApi.bat)** for read operations (runs directly without PowerShell). To enable write operations, run `Install-WsusRestApi.bat --enable-write-operations`. To rotate keys on re-install, run `Install-WsusRestApi.bat --regenerate-tokens`.
   - The installer automatically generates random **X-Api-Key** and **Bearer Token** values (48-char hex) in `C:\inetpub\wsus-api\Config\security.json` and displays them on screen after installation (pass `--regenerate-tokens` or `-RegenerateTokens` to rotate existing custom keys).
3. Adjust additional settings if needed:
   - `C:\inetpub\wsus-api\Config\security.json`
   - `C:\inetpub\wsus-api\Config\Wsus\wsus-settings.json` (configure `serverId`/`serverName` and the 5-minute refresh interval)
4. Review the installer output for the authenticated WSUS summary check. If it reports that read access is unverified, confirm that `IIS AppPool\WsusRestApiPool` belongs to the local `WSUS Reporters` group and inspect the reported API error. The installer keeps the existing least-privilege setup and does not add the AppPool to `WSUS Administrators` unless `--enable-write-operations` is specified.
