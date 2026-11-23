# AGENTS.md

> อ่าน `STATUS.md` ก่อนเริ่มงาน (Read `STATUS.md` before starting work).

## Overview
- Monorepo (`wsus-app-monorepo`) for centralized WSUS patch compliance tracking across multiple WSUS servers, backed by PostgreSQL and a local WSUS IIS REST API.

## Tech Stack
- **Monorepo**: `pnpm` + Turborepo (`pnpm-workspace.yaml`, `turbo.json`)
- **Web (`apps/web`)**: Next.js 16 (`cacheComponents: true`, `partialPrefetching: true`), React 19, Prisma 7 (`@prisma/adapter-pg`), `jose` (HS256 JWT), `bcryptjs`
- **Gateway (`apps/gateway`)**: Hono + `@hono/node-server`
- **UI (`packages/ui`, `@workspace/ui`)**: `@base-ui/react` + Tailwind CSS v4 + `lucide-react` + `recharts`
- **WSUS Agent (`wsus/WsusRestApi`)**: C# / `.NET Framework 4.8` IIS sub-application

## Repo Structure
- `apps/web/` — Next.js App Router portal, API Route Handlers, Prisma schema/seed (`generated/prisma` output), and core libs
- `apps/gateway/` — Optional Hono HTTP proxy forwarding read-only WSUS API calls when `WSUS_GATEWAY_URL` is set
- `packages/ui/` — Shared `@workspace/ui` primitives (`components/ui/*`, `lib/*`, `hooks/*`)
- `wsus/` — Read-only C# IIS REST API (`WsusRestApi/`) and Windows Server deployment scripts

## Ask First
Do not run or modify the following without explicit user approval:
- `prisma db push`, `prisma db seed`, or edits to `apps/web/prisma/schema.prisma`
- Calling `/api/settings/reset` or any destructive DB delete/truncate command
- Adding new dependencies or bumping major versions in any `package.json`
- Editing `.env` files, CI configs, Dockerfiles, or production configs
- Running `wsus/Install-WsusRestApi.bat` or `wsus/install-on-wsus.ps1` (especially `-RegenerateTokens`, which rotates `security.json` keys)

## Commands
> Windows PowerShell 5.1 does not support `&&`; wrap chained commands in `cmd /c "..."` or run separately.

- `pnpm install` — Install workspace dependencies
- Env setup: create `apps/web/.env` (`DATABASE_URL`, `AUTH_SECRET`; `TODO: Confirm` — no `apps/web/.env.example` exists) and `apps/gateway/.env` from `apps/gateway/.env.example`
- `pnpm dev:web` / `pnpm dev:gateway` — Run dev servers (`package.json`)
- `pnpm --filter @wsus-app/web typecheck` / `pnpm --filter @wsus-app/web build` — Typecheck and production build
- `pnpm --filter @wsus-app/web exec eslint <file...>` — Lint specific modified files
- `pnpm --filter @wsus-app/gateway typecheck` / `pnpm --filter @wsus-app/gateway build` — Typecheck and build gateway
- `pnpm --filter @wsus-app/web exec prisma generate` — Generate Prisma client to `apps/web/generated/prisma`
- `pnpm --filter @wsus-app/web exec prisma db push` / `prisma db seed` — Push schema or seed default admin (`TODO: Confirm` production seed policy)

## WSUS REST API (`wsus/WsusRestApi`, C#)
- **Strict Read-Only Rule**: Never add endpoints that write, approve, decline, or delete updates/computers on WSUS. `apps/gateway` only proxies `GET`/`HEAD`/`OPTIONS` (`apps/gateway/src/index.ts`, `routes/wsus.ts`).
- **Build & Deploy**: No `.csproj`/`.sln` exists; `wsus/install-on-wsus.ps1` compiles directly on the WSUS host using `.NET Framework 4.8` `csc.exe` + `Microsoft.UpdateServices.Administration.dll` and deploys to IIS (`C:\inetpub\wsus-api`, Site `WSUS Administration`, AppPool `WsusRestApiPool`, port `8530`, path `/wsus-api`).
- **API & Verification**: Base path `/wsus-api/api/v1` (`X-Api-Key` header from `Config/security.json`). Verify via `GET /wsus-api/api/v1/health` or `POST /api/wsus-servers/[id]/test`.
- **Deployment Rule**: `TODO: Confirm` — clarify preferred deployment restriction (repo provides `wsus/Install-WsusRestApi.bat` one-click wrapper around `install-on-wsus.ps1`).

## Code Conventions
- **Server vs Client Components**: `app/(app)/**/page.tsx` and `layout.tsx` are Server Components that query `prisma` and `getSession()` directly, serialize `Date`s to ISO strings, and pass props to `"use client"` components in `apps/web/components/`.
- **Imports & Naming**: Import shared UI from `@workspace/ui/components/ui/*` (not `@wsus-app/ui`); use `@/*` alias (`apps/web/tsconfig.json`) for app-local imports. Files use `kebab-case`; React components use `PascalCase`.
- **Prisma Client**: Always import `prisma` singleton from `@/lib/prisma` (`@prisma/adapter-pg` + `pg.Pool` cached in `globalThis`).
- **Next.js 16**: `await` `context.params` and `cookies()`; `getSession()` (`apps/web/lib/auth.ts`) calls `await io()` before `jwtVerify` for `cacheComponents`.
- **Route Handler Validation & Errors**: Manually parse `await request.json()`, validate fields (`typeof`/regex/`new URL`), and return `NextResponse.json({ error: "..." }, { status })` (`400`/`401`/`403`/`404`/`409`/`500`).

## Architecture Rules
- **WSUS Sync Flow**: When `WSUS_GATEWAY_URL` is set (`apps/web/lib/wsus-api-sync.ts`), requests route through `@wsus-app/gateway` with `x-wsus-base-url` and `x-wsus-api-key` headers.
- **RBAC (`apps/web/lib/rbac.ts`)**: Three roles — `admin` (users, servers, DB reset, sync), `operator` (read + test/trigger sync), `viewer` (read-only) — enforced in `apps/web/proxy.ts` and Route Handlers.
- **Patch Deduplication (`apps/web/lib/patch-dedupe.ts`)**: `PatchInventory` writes must pass through `dedupePatchInventory()` (deduped by `updateId` and `title`); build `updateApprovalMap` from the full list before deduplicating.
- **Lazy Cache Refresh**: `LazyDataRefresh` (`apps/web/components/lazy-data-refresh.tsx`) polls `/api/data-version` only when the tab is visible and triggers `revalidatePath("/", "layout")` when data changes.

## Security & Safety
- **Never Expose Secrets**: `WsusServer.apiKey` and `User.passwordHash` must never be returned in `GET` APIs, Server Component props, or client state; `apiKey` is overwrite-only via `PATCH`.
- **Partial Updates Only**: `PATCH /api/wsus-servers/[id]` must only send changed fields; never overwrite `apiKey` with an empty or stale value.
- **User Guards (`/api/users/[id]`)**: Prevent self-deletion, self-demotion, and deleting or demoting the last remaining `admin`.
- **Never commit or log real secrets, API keys, IPs, or passwords** in code, logs, or docs.

## Testing
- **No automated test suite or CI exists** (no test script in `package.json`, no `.github/workflows`) — `TODO: Confirm` whether to add a test framework/CI.
- Verification currently relies on `typecheck`, targeted `eslint`, `next build`, and manual UI/API checks (`POST /api/wsus-servers/[id]/test`, `/login`, `/users`, `/sync/[id]`).

## Definition of Done
1. `pnpm --filter @wsus-app/web typecheck` passes (and `@wsus-app/gateway typecheck` if gateway files changed).
2. `pnpm --filter @wsus-app/web exec eslint` passes on all created or modified files.
3. `pnpm --filter @wsus-app/web build` succeeds without errors.
4. If `apps/web/prisma/schema.prisma` changed, run `prisma generate` (with approval) and check impact on `apps/web/lib/data-version.ts`.

## Known Pitfalls
- **Base UI (`@base-ui/react`)**: `<DropdownMenuLabel>` must be inside `<DropdownMenuGroup>` (`MenuGroupContext is missing`); `<Button render={<Link ... />} />` requires `nativeButton={false}`; `<Select onValueChange>` can pass `null`.
- **Pre-existing ESLint Errors**: `apps/web/components/patches-browser.tsx` and `apps/web/components/wsus-servers-manager.tsx` fail `react-hooks/set-state-in-effect` (verified); lint touched files instead of the whole app.
- **WSUS Remote Error**: `Access to the path 'Update Services' is denied` means the IIS AppPool identity on the WSUS host lacks `WSUS Administrators`/`WSUS Reporters` permissions — not an invalid `X-Api-Key`.
- **Outdated `README.md`**: `README.md` still references `/import` and CSV exports, which were removed (`TODO: Confirm` whether to update `README.md`).
