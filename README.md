# WSUS Portal (`wsus-app`)

A Next.js + Prisma + PostgreSQL dashboard for browsing WSUS patch inventory, client compliance status, synchronization history, and importing WSUS CSV exports.

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

Place your WSUS CSV export files inside a `data/` directory at the project root:

- `data/Classifications.csv`
- `data/Products.csv`
- `data/Client_Status.csv`
- `data/Patch_Inventory.csv`
- `data/Client_Patch_Status.csv`
- `data/Synchronization_History.csv`
- `data/Synchronization_Settings.csv`

Then run the seed script:

```bash
pnpm prisma db seed
```

This creates the default administrator account (`admin` / `P@ssw0rd`) and imports the CSV data into PostgreSQL.

> **Note:** Additional WSUS CSV/ZIP exports can also be uploaded from the `/import` page in the web UI after signing in.

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
