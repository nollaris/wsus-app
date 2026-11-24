# Durable WSUS Sync Worker

## Goal

Move WSUS synchronization out of the Next.js request process into a durable background worker. Next.js should enqueue work, return a job ID quickly, and expose authenticated job status and results to the UI.

## Recommended design

- Use BullMQ with Redis as the durable queue.
- Run a separate Node.js worker process alongside the Next.js application.
- Keep PostgreSQL as the source of truth for synchronized WSUS data and each server's `lastStatus` / `lastError`.
- Keep queue lifecycle, progress, and concise sync results in BullMQ/Redis with a configured retention period.
- Place the worker where it can reach every configured WSUS API endpoint. If those endpoints are private/on-premises, the worker must run on that network or have an approved private network path.
- Do not add a Prisma job model in this implementation. A later requirement for long-term job history would need a separate schema/migration decision.

## Existing behavior to preserve

- All existing scopes and sync limits accepted by `POST /api/wsus-sync`.
- Per-server sync status and error reporting.
- Cancellation for queued and active syncs.
- RBAC: only operators/admins can start or cancel syncs.
- API keys remain server-side and are loaded by the worker from PostgreSQL.
- The existing immediate WSUS connection-test endpoint remains synchronous.
- Existing sync writes, including patch deduplication and transaction behavior.

## Implementation steps

### 1. Add queue infrastructure

Add a queue module under `apps/web/lib/` to own the BullMQ queue and Redis connection. Define a typed job payload containing only the server ID, sync scope, and validated sync limits; never include an API key in the queue payload.

Configure bounded worker concurrency and queue retention for completed/failed jobs. Add Redis configuration through deployment environment settings; do not commit credentials.

### 2. Run sync jobs in a separate process

Add a worker entry point under `apps/web/` and a package script to run it independently of `next start`. The worker should:

- Load the configured server and API key from PostgreSQL when processing a job.
- Reuse the current synchronization implementation in `apps/web/lib/wsus-api-sync.ts`; refactor its entry point only as needed so the worker can await a single server sync.
- Apply a global concurrency limit and prevent overlapping jobs for the same WSUS server.
- Update `WsusServer.lastStatus` and `lastError` as the job starts, succeeds, fails, or is cancelled.
- Report safe progress and return a summary such as server ID, scope, counts, and duration.
- Retry only transient network and server errors with bounded exponential backoff. Do not retry authentication/authorization or other permanent client errors.
- Store useful error details without logging or returning API keys.

### 3. Change the sync API to enqueue and report jobs

Update `POST /api/wsus-sync` to enqueue one job per requested server and return `202 Accepted` with the job IDs and initial status. Preserve current request validation, authorization, scope, and limit behavior.

Add an authenticated `GET /api/sync-jobs/[jobId]` endpoint that returns only the job ID, state, safe progress, result summary, and a user-safe error. Update the existing cancel operation to remove queued jobs and signal the worker to abort active jobs; cancellation must work across separate Next.js and worker processes.

### 4. Update the UI

Update `apps/web/components/wsus-server-control.tsx` and `apps/web/components/wsus-servers-manager.tsx` to track the returned job IDs and display queued/running/completed/failed/cancelled states. Poll status at a modest interval while jobs are active, stop polling after completion, and continue to refresh server data.

For multi-server sync, show status per server rather than treating the entire batch as one success/failure. Keep the existing server-level status display as a useful fallback after queue job records expire.

### 5. Document and deploy the worker

Document how to start and supervise the worker separately from Next.js, how to configure Redis, and the required network access to WSUS. Use the deployment platform's existing process supervisor. Do not change Docker, CI, production configuration, or `.env` files without explicit approval.

## Files expected to change

- `apps/web/lib/wsus-api-sync.ts`
- New queue module under `apps/web/lib/`
- New worker entry point under `apps/web/`
- `apps/web/app/api/wsus-sync/route.ts`
- New `apps/web/app/api/sync-jobs/[jobId]/route.ts`
- `apps/web/components/wsus-server-control.tsx`
- `apps/web/components/wsus-servers-manager.tsx`
- `apps/web/package.json`, root `package.json`, and `pnpm-lock.yaml` as needed
- Relevant setup documentation

Do not edit `apps/web/prisma/schema.prisma` or run database schema/seed commands for this design.

## Approval and deployment prerequisites

- Adding BullMQ and a Redis client changes package manifests and requires explicit approval under the repository instructions.
- A Redis service and deployment-time Redis URL must be provisioned; do not edit `.env` or production configuration without approval.
- Confirm that the worker host can connect to PostgreSQL and all configured WSUS APIs before implementation.
- If durable job history beyond Redis retention is required, ask for approval before proposing a Prisma schema change and migration.

## Verification

### Automated

- Web typecheck and targeted ESLint for every modified Web file.
- Worker typecheck/build using the repository's existing toolchain.
- Web production build.
- Verify no API key or sensitive server configuration appears in queue payloads or status responses.

### Manual

1. Enqueue a sync for one server and confirm the API responds promptly with `202` and a job ID.
2. Confirm the worker processes it after the request has completed and updates server status.
3. Enqueue multiple servers and verify bounded concurrency and independent per-server results.
4. Verify progress polling, completed results, failures, retries, and cancellation of both queued and active jobs.
5. Restart the Next.js process during a sync and confirm the worker/job continues.
6. Restart the worker during a job and verify BullMQ recovery/retry behavior without overlapping writes.
7. Test a bad API key and a network timeout; confirm each produces a useful failure without retrying permanent authentication errors indefinitely.

## Completion criteria

- A sync continues independently of the Next.js request/process lifetime.
- The UI can retrieve each server job's current status and final summary.
- Multiple servers are processed with bounded concurrency and no overlapping sync per server.
- Cancellation, failure reporting, and retry behavior are explicit and observable.
- Existing sync scopes, data writes, RBAC, and secret-handling rules are preserved.
- Required typecheck, lint, build, and manual checks pass.
