# Remove the Optional Gateway

## Goal

Remove `apps/gateway` and all gateway routing/configuration so the Web application connects directly to each WSUS IIS REST API base URL.

## Scope

### Files and directories to change

- [apps/web/lib/wsus-api-sync.ts](../apps/web/lib/wsus-api-sync.ts)
- [package.json](../package.json)
- [pnpm-lock.yaml](../pnpm-lock.yaml)
- [AGENTS.md](../AGENTS.md)
- [STATUS.md](../STATUS.md)
- [apps/gateway](../apps/gateway) — delete

### Files not to change

- `apps/web/prisma/schema.prisma`
- Prisma database or seed configuration
- `.env` files
- WSUS IIS REST API source
- WSUS deployment scripts

## Implementation Steps

### 1. Remove gateway routing from Web synchronization

Edit `apps/web/lib/wsus-api-sync.ts`:

- Remove lookup and normalization of `process.env.WSUS_GATEWAY_URL`.
- Remove gateway-specific URL selection.
- Always construct the request URL from the configured WSUS server:

  ```ts
  const url = `${normalizeBaseUrl(server.baseUrl)}${path}`;
  ```

- Keep `Accept: application/json` and `X-Api-Key: server.apiKey`.
- Remove the gateway-only headers:
  - `x-wsus-base-url`
  - `x-wsus-api-key`
- Preserve existing timeout, cancellation, pagination, query parameters, and error handling.

### 2. Delete the gateway application

Delete the complete `apps/gateway` directory, including:

- Package and TypeScript configuration
- `.env.example`
- Hono server entry point
- Gateway routes
- Gateway WSUS proxy client

Do not delete or modify `apps/web` or `wsus/WsusRestApi`.

### 3. Remove gateway scripts

Edit the root `package.json`:

- Remove `dev:gateway`.

Keep existing scripts for Web development, builds, linting, and type checking unless separately changed.

### 4. Refresh workspace dependencies

Run dependency installation using the existing workspace package manager:

```powershell
pnpm install
```

Review the resulting `pnpm-lock.yaml` change and confirm that gateway-only dependencies are removed while unrelated dependencies remain unchanged.

Do not add packages or bump dependency majors.

### 5. Update repository documentation

Edit `AGENTS.md`:

- Remove `apps/gateway` from the tech stack.
- Remove `apps/gateway` from the repository structure.
- Remove gateway environment setup instructions.
- Remove `pnpm dev:gateway`.
- Remove gateway typecheck/build commands.
- Remove the gateway read-only-rule reference.
- Replace the WSUS sync-flow rule with direct Web-to-Wsus-REST-API communication.

Edit `STATUS.md`:

- Remove gateway references from project goals.
- Remove gateway build/typecheck verification items.
- Update next steps and definition-of-done references to Web-only verification.
- Remove gateway from architecture and open decisions.

Update any other documentation or configuration that mentions:

- `@wsus-app/gateway`
- `WSUS_GATEWAY_URL`
- `apps/gateway`
- `dev:gateway`
- `x-wsus-base-url`
- `x-wsus-api-key`

### 6. Search for stale references

Run a repository search for gateway-related terms:

```powershell
rg -n "apps/gateway|@wsus-app/gateway|WSUS_GATEWAY_URL|dev:gateway|x-wsus-base-url|x-wsus-api-key"
```

No source or documentation reference should remain for the gateway.

## Verification

### Static verification

Run the following:

```powershell
pnpm --filter @wsus-app/web typecheck
pnpm --filter @wsus-app/web exec eslint apps/web/lib/wsus-api-sync.ts
pnpm --filter @wsus-app/web build
```

Expected results:

- Web TypeScript type checking passes.
- Modified gateway-related Web source passes targeted ESLint.
- The Next.js production build succeeds.

Do not run `pnpm --filter @wsus-app/gateway ...` after removal.

### Manual verification

Confirm direct connectivity from the Web application:

1. Sign in to `/login`.
2. Open `/sync/[id]`.
3. Verify `POST /api/wsus-servers/[id]/test`.
4. Verify computer synchronization.
5. Verify update synchronization.
6. Verify sync-history retrieval.
7. Verify client-patch synchronization.

Test at least one configured WSUS server from the normal Web server/network environment. A successful direct connection confirms that `server.baseUrl` and `server.apiKey` are still passed correctly.

## Completion Criteria

- `apps/gateway` no longer exists.
- `WSUS_GATEWAY_URL` and gateway forwarding headers are removed.
- Web synchronization makes direct requests to configured WSUS REST API URLs.
- Root scripts no longer contain `dev:gateway`.
- Documentation no longer describes `apps/gateway` as part of the project.
- The workspace lockfile is consistent.
- Web typecheck, targeted ESLint, and build pass.
- Direct WSUS server testing works through the Web application.
