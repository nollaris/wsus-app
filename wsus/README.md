# WSUS REST API Backend (.NET Framework 4.8 Web API)

Read-only REST API backend built with **C# .NET Framework 4.8 (ASP.NET Web API 2)** for querying **multiple WSUS servers** with **5-minute MemoryCache + background refresh**, **Authentication**, **NLog structured logging**, and **CORS** configured for **Next.js**.

## Key Features

- **Separated Configuration Folders**:
  - `Config/NextJs/nextjs-client.json`: CORS origins, `authEnabled`, `apiKeys`, and `bearerTokens` for Next.js (hot-reloads on change).
  - `Config/Wsus/wsus-servers.json`: Multi-WSUS server list (hot-reloads on change).
  - `Config/Wsus/wsus-settings.json`: Cache TTL (5 minutes), background refresh toggle, and max sync history items.
- **5-Minute Refresh & Caching**:
  - `MemoryCache` with 5-minute TTL (`Wsus:CacheDurationMinutes`).
  - `WsusBackgroundRefreshService` refreshes all enabled WSUS servers in parallel every 5 minutes so Next.js requests hit warm cache.
- **Strictly Read-Only Access**:
  - Only `GET`, `HEAD`, and `OPTIONS` are permitted at both IIS (`Web.config`) and Web API (`ReadOnlyGuardFilter`) levels.
  - Zero state-mutating WSUS SDK calls (`Approve`, `Decline`, `StartSynchronization`, etc. are never invoked).
- **Authentication**:
  - Supports `X-Api-Key` or `Authorization: Bearer <token>` with constant-time comparison (`WsusAuthFilter`).
  - `/api/v1/health` is `[AllowAnonymous]` for load balancer / uptime probes.
- **Logging**:
  - `NLog` writes daily rolling logs to `App_Data/Logs/wsus-api-YYYY-MM-DD.log` and errors to `wsus-api-errors-YYYY-MM-DD.log`.
  - `RequestLoggingHandler` attaches `X-Correlation-Id` and logs HTTP method, path, status code, duration (ms), and client IP.
- **Next.js Ready**:
  - CamelCase JSON + UTC ISO-8601 timestamps.
  - Standardized response envelope: `{ success, data, meta, error }`.
  - Configurable CORS origins (`Cors:AllowedOrigins`).

## Endpoints

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/api/v1/health` | Health check, uptime, last refresh cycle timestamp |
| `GET` | `/api/v1/servers` | List all configured WSUS servers & online/cache status |
| `GET` | `/api/v1/summary` | Global aggregated summary across all enabled WSUS servers |
| `GET` | `/api/v1/servers/{serverId}/summary` | Summary for a specific WSUS server |
| `GET` | `/api/v1/servers/{serverId}/computers` | Paginated & filterable computers (`search`, `group`, `os`, `status`, `page`, `pageSize`) |
| `GET` | `/api/v1/servers/{serverId}/computers/{computerId}` | Computer details + needed/failed/pendingReboot/installed updates |
| `GET` | `/api/v1/servers/{serverId}/updates` | Paginated & filterable updates (`search`, `classification`, `severity`, `approved`, `declined`, `kb`, `page`, `pageSize`) |
| `GET` | `/api/v1/servers/{serverId}/updates/{updateId}` | Update details, description, approvals, and per-computer status |
| `GET` | `/api/v1/servers/{serverId}/groups` | Computer target groups with compliance summary |
| `GET` | `/api/v1/servers/{serverId}/groups/{groupId}` | Target group details + member computers |
| `GET` | `/api/v1/servers/{serverId}/sync` | Sync settings, current sync status, and history (`limit`) |

## Prerequisites & Build

1. Windows Server / Windows 10/11 with **.NET Framework 4.8 Developer Pack** and **Visual Studio 2022** (or MSBuild Build Tools).
2. **WSUS Administration Console** installed on the API host (provides `C:\Program Files\Update Services\Api\Microsoft.UpdateServices.Administration.dll`).
3. Restore NuGet packages and build `WsusRestApi.sln` in Release mode.

## One-Click Install on WSUS Server Host (Port 8530)

เพื่อไม่ให้ชนกับ Endpoint เดิมของ WSUS บน Port 8530 (`/ClientWebService`, `/ApiRemoting30`, `/ReportingWebService`, `/SimpleAuthWebService` ฯลฯ) ตัว Installer จะสร้าง:
- **Isolated AppPool** ชื่อ `WsusRestApiPool` (64-bit, `.NET CLR v4.0`, Integrated) แยกจาก `WsusPool`
- **IIS Sub-Application** ที่ `/wsus-api` ภายใต้ Site `WSUS Administration` (Port 8530)
- เพิ่มสิทธิ์ `IIS AppPool\WsusRestApiPool` เข้ากลุ่ม `WSUS Reporters` (Read-only)

วิธีติดตั้งบนเครื่อง WSUS Server ปลายทาง:
1. คัดลอกโฟลเดอร์ `wsus-api/` ไปยังเครื่อง WSUS Server
2. ดับเบิลคลิก **[Install-WsusRestApi.bat](Install-WsusRestApi.bat)** (หรือรัน `powershell -ExecutionPolicy Bypass -File install-on-wsus.ps1` ด้วยสิทธิ์ Administrator)
3. แก้ไขค่าตามโฟลเดอร์ที่แยกไว้:
   - สำหรับ Next.js (`Auth` & `CORS`): `C:\inetpub\wsus-api\Config\NextJs\nextjs-client.json`
   - สำหรับ WSUS (`Servers` & `Cache/Sync`): `C:\inetpub\wsus-api\Config\Wsus\wsus-servers.json` และ `wsus-settings.json`

Base URL หลังติดตั้ง: `http://<wsus-host>:8530/wsus-api/api/v1`

## Next.js Integration Example

Add to `.env.local` in your Next.js app:

```env
WSUS_API_BASE_URL=http://wsus-hq.corp.local:8530/wsus-api/api/v1
WSUS_API_KEY=wsus-readonly-api-key-change-me-2026
```

Example server-side helper (`lib/wsus-api-client.ts`):

```ts
const BASE_URL = process.env.WSUS_API_BASE_URL!;
const API_KEY = process.env.WSUS_API_KEY!;

export async function fetchWsusApi<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "X-Api-Key": API_KEY,
    },
    next: { revalidate: 300 }, // Matches 5-minute backend cache
  });

  if (!res.ok) {
    throw new Error(`WSUS API error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  if (!json.success) {
    throw new Error(json.error?.message ?? "Unknown WSUS API error");
  }

  return json.data as T;
}
```
