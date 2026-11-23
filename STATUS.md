# STATUS.md

## Goal
Centralized WSUS patch compliance portal (`apps/web`), optional read-only Hono proxy (`apps/gateway`), and read-only IIS REST API (`wsus/WsusRestApi`), transitioning away from CSV import to direct WSUS API sync with RBAC.

## Current State
- ✅ `990b32a` committed on `main` (1 ahead of `origin/main`): user management & RBAC (`admin`/`operator`/`viewer`).
- ✅ `pnpm --filter @wsus-app/web typecheck` passes (`tsc --noEmit`, exit 0).
- 🚧 Uncommitted refactor in working tree (15 modified/deleted, 6 untracked):
  - Removed CSV importer (`apps/web/lib/csv-importer.ts`, `adm-zip`/`csv-parse` in `apps/web/package.json`).
  - Added/updated WSUS sync, deduplication, and server control (`apps/web/lib/wsus-api-sync.ts`, `apps/web/lib/patch-dedupe.ts`, `apps/web/lib/format.ts`, `apps/web/app/(app)/sync/[id]/page.tsx`, `apps/web/components/wsus-server-control.tsx`, `apps/web/app/api/wsus-sync/route.ts`).
  - Added PowerShell-free WSUS installer (`wsus/Install-WsusRestApi.bat`, `wsus/Install-WsusRestApi.cs`, `wsus/README.md`).
  - Added `AGENTS.md` (untracked).
- ❌ `pnpm --filter @wsus-app/web exec eslint` on 14 touched `.ts`/`.tsx` files failed (2 errors, 2 warnings):
  - `apps/web/components/patches-browser.tsx` L140: `react-hooks/set-state-in-effect`
  - `apps/web/components/wsus-servers-manager.tsx` L86: `react-hooks/set-state-in-effect`; L77: unused `testingId`/`setTestingId`
- ❌ `apps/web` production build, `apps/gateway` typecheck/build, and runtime/UI tests: Not verified.

## Next Steps
1. Fix unused `testingId`/`setTestingId` (L77) and `react-hooks/set-state-in-effect` (L86) in `apps/web/components/wsus-servers-manager.tsx`, plus `react-hooks/set-state-in-effect` (L140) in `apps/web/components/patches-browser.tsx`, then re-run targeted `eslint`.
2. Run `pnpm --filter @wsus-app/web build` and `pnpm --filter @wsus-app/gateway typecheck` to verify production build.
3. Review `git status` / `git diff` and commit (or stage) the pending WSUS sync, CSV removal, `AGENTS.md`, and `wsus/` installer changes.
4. Manually verify `/sync/[id]`, `POST /api/wsus-servers/[id]/test`, and `wsus/Install-WsusRestApi.bat` on a WSUS host (with user approval).

## Decisions Made
- Removed CSV import (`apps/web/lib/csv-importer.ts`); all patch data comes from read-only WSUS REST API sync (`apps/web/lib/wsus-api-sync.ts`).
- `PatchInventory` writes deduplicate via `dedupePatchInventory()` (`apps/web/lib/patch-dedupe.ts`).
- WSUS installer (`wsus/Install-WsusRestApi.bat` + `wsus/Install-WsusRestApi.cs`) compiles/deploys without requiring PowerShell.

## Open Questions
- `README.md` still references `/import` and CSV exports — confirm whether to update it.
- Confirm production seed policy (`prisma db seed`) and whether to add an automated test suite/CI.
- Confirm deployment rule in `AGENTS.md` regarding `wsus/Install-WsusRestApi.bat`.

## Do Not Touch
- `apps/web/prisma/schema.prisma`, `prisma db push`, `prisma db seed`, `/api/settings/reset` without explicit user approval.
- `.env` files, `wsus/Install-WsusRestApi.bat` / `wsus/install-on-wsus.ps1` execution, or `package.json` dependency additions/major bumps without approval.
- Read-only constraint on `wsus/WsusRestApi` and `apps/gateway` (`GET`/`HEAD`/`OPTIONS` only).

## Quick Verify
- Typecheck: `pnpm --filter @wsus-app/web typecheck`
- Targeted lint: `pnpm --filter @wsus-app/web exec eslint <modified-files...>`
- Build: `pnpm --filter @wsus-app/web build`
