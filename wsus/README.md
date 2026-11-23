# WSUS Local REST API (Production Server Only)

Read-only REST API สำหรับติดตั้งบนเครื่อง **WSUS Server** แต่ละเครื่องโดยเฉพาะ เชื่อมต่อกับ **Local WSUS Service** บนเครื่องนั้นเท่านั้น (`AdminProxy.GetUpdateServer()`) ไม่มีการรีโมทไปยังเครื่องอื่น และ**ไม่ต้องติดตั้งเครื่องมือพัฒนาใด ๆ**

## Key Features

- **Local WSUS Only**: เชื่อมต่อเฉพาะ WSUS บนเครื่องที่ติดตั้งเท่านั้น
- **Zero Dev Tools & No PowerShell Required**: ใช้ `.NET Framework 4.8` (`csc.exe`), IIS `appcmd.exe` และ `Microsoft.UpdateServices.Administration.dll` ที่มีอยู่บน Windows Server โดยตรง ไม่ต้องใช้ Visual Studio หรือ PowerShell
- **Non-Colliding Port 8530 Hosting**: ติดตั้งเป็น IIS Sub-Application ที่ `/wsus-api` ภายใต้ Site `WSUS Administration` พร้อม AppPool แยกอิสระ (`WsusRestApiPool`) ไม่ชนกับ Endpoint เดิมของ WSUS
- **5-Minute Refresh & Caching**: `MemoryCache` TTL 5 นาที พร้อม background refresh ทุก 5 นาที
- **Strictly Read-Only**: อนุญาตเฉพาะ `GET`, `HEAD`, `OPTIONS` และใช้สิทธิ์ `WSUS Reporters`
- **Configuration**:
  - `Config/security.json` — `authEnabled`, `apiKeys`, `bearerTokens`, `allowedOrigins`
  - `Config/Wsus/wsus-settings.json` — `serverId`, `serverName`, `cacheDurationMinutes`, `enableBackgroundRefresh`, `maxSyncHistoryItems`
- **Logging**: บันทึก log รายวันลง `App_Data/Logs/wsus-api-YYYY-MM-DD.log`

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

## One-Click Install on WSUS Server

1. คัดลอกโฟลเดอร์ `wsus/` ไปยังเครื่อง **WSUS Server**
2. ดับเบิลคลิก **[Install-WsusRestApi.bat](Install-WsusRestApi.bat)** (รันได้ทันทีโดยไม่ต้องใช้ PowerShell; หากต้องการสุ่มคีย์ใหม่ในการติดตั้งซ้ำ ให้รัน `Install-WsusRestApi.bat --regenerate-tokens`)
   - *(ทางเลือกสำหรับ PowerShell)* สามารถรัน `powershell -ExecutionPolicy Bypass -File install-on-wsus.ps1` ด้วยสิทธิ์ Administrator ได้เช่นกัน
   - สคริปต์จะสุ่มค่า **X-Api-Key** และ **Bearer Token** (48-char hex) ให้อัตโนมัติใน `C:\inetpub\wsus-api\Config\security.json` และแสดงค่าบนหน้าจอหลังติดตั้งเสร็จ (หากต้องการสุ่มใหม่ในการติดตั้งซ้ำ ให้ใช้ `--regenerate-tokens` หรือ `-RegenerateTokens`)
3. แก้ไขค่าตั้งค่าเพิ่มเติม (ถ้าต้องการ):
   - `C:\inetpub\wsus-api\Config\security.json`
   - `C:\inetpub\wsus-api\Config\Wsus\wsus-settings.json` (ตั้งค่า `serverId`/`serverName` และรอบ refresh 5 นาที)
