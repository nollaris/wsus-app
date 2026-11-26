# WSUS Portal (`wsus-app`)

A Next.js + Prisma + PostgreSQL dashboard for browsing WSUS patch inventory, client compliance status, synchronization history, and controlling selected WSUS operations.

Administrators can create computer groups, add computers to groups, start upstream synchronization, and approve patches immediately or at a scheduled time from **WSUS Control**. The WSUS REST API keeps write operations disabled at install time unless `--enable-write-operations` is specified; future approvals require the portal's persistent Node.js scheduler and the `WsusApprovalSchedule` database migration.

Before using scheduled approvals or the user-action Logs page on an existing installation, apply pending additive migrations with:

```bash
pnpm --filter @wsus-app/web exec prisma migrate deploy
```

The Logs page records user-initiated portal operations, including sync requests, approvals, and configuration changes. Background WSUS status updates are not treated as user actions.

Run the portal as a persistent Node.js server so the in-process scheduler can execute due approvals.

## Prerequisites

- **Node.js** `20.19+`, `22.12+`, or `24.0+` (required by Prisma 7)
- **pnpm**
- **PostgreSQL** (e.g. running on `localhost:5432`)

## Project Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment variables

Create a `.env` file in the project root:

```env
DATABASE_URL="postgresql://wsus_user:wsus_pass_2026@localhost:5432/wsus_db?schema=public"
AUTH_SECRET="replace-with-a-strong-random-secret"
```

Make sure the PostgreSQL role and database exist (for example, using `psql` as a superuser):

```sql
CREATE USER wsus_user WITH PASSWORD 'wsus_pass_2026' CREATEDB;
CREATE DATABASE wsus_db OWNER wsus_user;
```

### 3. Generate Prisma client & push schema

```bash
pnpm prisma generate
pnpm prisma db push
```

### 4. Seed the database

Run the seed script to create the default administrator account (`admin` / `P@ssw0rd`):

```bash
pnpm prisma db seed
```

> **Note:** After signing in, upload your WSUS CSV/ZIP exports from the `/import` page in the web UI.

### 5. Run the development server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser and sign in at `/login`.

## Available Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the Next.js development server |
| `pnpm build` | Build the application for production |
| `pnpm start` | Start the production server |
| `pnpm lint` | Run ESLint |
