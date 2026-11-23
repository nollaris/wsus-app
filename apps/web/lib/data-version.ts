import { prisma } from "@/lib/prisma";

interface DataVersionRow {
  servers_count: number;
  max_server_sync: Date | null;
  sync_history_count: number;
  max_sync_start: Date | null;
  clients_count: number;
  patches_count: number;
  client_patch_count: number;
}

const globalForVersion = globalThis as unknown as {
  lastKnownDataVersion?: string;
};

/**
 * Computes a lightweight fingerprint of the current WSUS dataset in PostgreSQL
 * in a single round-trip so callers can detect new data lazily.
 */
export async function getDataVersion(): Promise<string> {
  const rows = await prisma.$queryRaw<DataVersionRow[]>`
    SELECT
      (SELECT COUNT(*)::int FROM "WsusServer") AS servers_count,
      (SELECT MAX("lastSyncedAt") FROM "WsusServer") AS max_server_sync,
      (SELECT COUNT(*)::int FROM "SynchronizationHistory") AS sync_history_count,
      (SELECT MAX("startTime") FROM "SynchronizationHistory") AS max_sync_start,
      (SELECT COUNT(*)::int FROM "ClientStatus") AS clients_count,
      (SELECT COUNT(*)::int FROM "PatchInventory") AS patches_count,
      (SELECT COUNT(*)::int FROM "ClientPatchStatus") AS client_patch_count
  `;

  const r = rows[0];
  if (!r) return "empty";

  return [
    r.servers_count,
    r.max_server_sync ? r.max_server_sync.getTime() : 0,
    r.sync_history_count,
    r.max_sync_start ? r.max_sync_start.getTime() : 0,
    r.clients_count,
    r.patches_count,
    r.client_patch_count,
  ].join(":");
}

export function checkAndUpdateServerDataVersion(nextVersion: string): boolean {
  const prev = globalForVersion.lastKnownDataVersion;
  globalForVersion.lastKnownDataVersion = nextVersion;
  return prev !== undefined && prev !== nextVersion;
}
