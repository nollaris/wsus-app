import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { dedupePatchInventory } from "@/lib/patch-dedupe";

export const SYNC_SCOPES = [
  "all",
  "computers",
  "updates",
  "sync",
  "client-patches",
] as const;
export type SyncScope = (typeof SYNC_SCOPES)[number];

export function isValidSyncScope(value: unknown): value is SyncScope {
  return (
    typeof value === "string" &&
    (SYNC_SCOPES as readonly string[]).includes(value)
  );
}

const globalForSync = globalThis as unknown as {
  activeWsusSyncs?: Set<number>;
};
const activeWsusSyncs =
  globalForSync.activeWsusSyncs ?? (globalForSync.activeWsusSyncs = new Set<number>());

interface WsusApiEnvelope<T> {
  success: boolean;
  data: T;
  meta?: {
    pagination?: {
      page: number;
      pageSize: number;
      totalItems: number;
      totalPages: number;
      hasNextPage?: boolean;
    };
  };
  error?: { code?: string; message?: string };
}

interface RemoteComputer {
  computerId: string;
  fullDomainName: string;
  ipAddress: string;
  osDescription: string;
  osVersion?: string | null;
  clientVersion: string;
  computerRole: string;
  requestedTargetGroup?: string | null;
  assignedTargetGroups?: string[];
  lastSyncTimeUtc?: string | null;
  lastReportedStatusTimeUtc?: string | null;
}

interface RemoteUpdate {
  updateId: string;
  revisionNumber: number;
  title: string;
  kbArticle?: string | null;
  products?: string[];
  classification: string;
  arrivalDateUtc?: string | null;
  creationDateUtc?: string | null;
  msrcSeverity: string;
  isApproved: boolean;
  isDeclined: boolean;
  isSuperseded: boolean;
  isLatestRevision: boolean;
  updateType: string;
}

interface RemoteSyncOverview {
  settings?: {
    synchronizeAutomatically: boolean;
    synchronizationTimeOfDayUtc: string;
    numberOfSynchronizationsPerDay: number;
  };
  history?: Array<{
    synchronizationId: string;
    startTimeUtc?: string | null;
    endTimeUtc?: string | null;
    result: string;
    startedManually: boolean;
    error?: string | null;
    errorText?: string | null;
    updateErrorsCount?: number;
  }>;
}

interface RemoteComputerUpdateStatus {
  updateId: string;
  revisionNumber: number;
  title: string;
  kbArticle?: string | null;
  classification: string;
  installationState: string;
  errorCode?: string | null;
  errorMessage?: string | null;
}

interface RemoteComputerDetail {
  computer: RemoteComputer;
  neededUpdates?: RemoteComputerUpdateStatus[];
  failedUpdates?: RemoteComputerUpdateStatus[];
  pendingRebootUpdates?: RemoteComputerUpdateStatus[];
  installedUpdates?: RemoteComputerUpdateStatus[];
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

async function fetchFromWsus<T>(
  server: { baseUrl: string; apiKey: string },
  path: string
): Promise<WsusApiEnvelope<T>> {
  const gatewayUrl = process.env.WSUS_GATEWAY_URL?.trim().replace(/\/+$/, "");
  const cleanBase = normalizeBaseUrl(server.baseUrl);

  const url = gatewayUrl ? `${gatewayUrl}${path}` : `${cleanBase}${path}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Api-Key": server.apiKey,
  };
  if (gatewayUrl) {
    headers["x-wsus-base-url"] = cleanBase;
    headers["x-wsus-api-key"] = server.apiKey;
  }

  const res = await fetch(url, {
    method: "GET",
    headers,
    cache: "no-store",
  });

  const json = (await res.json().catch(() => null)) as WsusApiEnvelope<T> | null;
  if (!res.ok || !json?.success) {
    throw new Error(
      json?.error?.message ?? `WSUS API returned HTTP ${res.status}`
    );
  }
  return json;
}

export async function testWsusServerConnection(server: {
  baseUrl: string;
  apiKey: string;
}) {
  const res = await fetchFromWsus<{
    status: string;
    serverId?: string;
    serverName?: string;
    cacheDurationMinutes?: number;
  }>(server, "/health");
  return res.data;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const idx = nextIndex++;
      if (idx >= items.length) break;
      results[idx] = await worker(items[idx]!, idx);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

async function fetchAllPages<T>(
  server: { baseUrl: string; apiKey: string },
  resourcePath: string
): Promise<T[]> {
  const pageSize = 500;
  const sep = resourcePath.includes("?") ? "&" : "?";
  const firstRes = await fetchFromWsus<T[]>(
    server,
    `${resourcePath}${sep}page=1&pageSize=${pageSize}`
  );

  const items: T[] = [...firstRes.data];
  const totalPages = firstRes.meta?.pagination?.totalPages ?? 1;
  if (totalPages <= 1) {
    return items;
  }

  const remainingPages = Array.from(
    { length: totalPages - 1 },
    (_, i) => i + 2
  );
  const pageResults = await mapWithConcurrency(
    remainingPages,
    6,
    async (page) => {
      const res = await fetchFromWsus<T[]>(
        server,
        `${resourcePath}${sep}page=${page}&pageSize=${pageSize}`
      );
      return res.data;
    }
  );

  for (const pageItems of pageResults) {
    items.push(...pageItems);
  }
  return items;
}

async function fetchComputerDetailsInBatches(
  server: { baseUrl: string; apiKey: string },
  computers: RemoteComputer[],
  concurrency = 16
): Promise<RemoteComputerDetail[]> {
  const results = await mapWithConcurrency(computers, concurrency, async (c) => {
    try {
      const res = await fetchFromWsus<RemoteComputerDetail>(
        server,
        `/computers/${encodeURIComponent(c.computerId)}`
      );
      return res.data;
    } catch {
      return null;
    }
  });

  return results.filter((item): item is RemoteComputerDetail => item !== null);
}

export async function syncWsusServerById(
  serverId: number,
  scope: SyncScope = "all"
) {
  const server = await prisma.wsusServer.findUnique({ where: { id: serverId } });
  if (!server) {
    throw new Error("WSUS server not found");
  }

  const syncComputers = scope === "all" || scope === "computers";
  const syncUpdates = scope === "all" || scope === "updates";
  const syncOverview = scope === "all" || scope === "sync";
  const syncClientPatches = scope === "all" || scope === "client-patches";

  const startedAt = Date.now();
  try {
    const [computers, updates, syncRes] = await Promise.all([
      syncComputers || syncClientPatches
        ? fetchAllPages<RemoteComputer>(server, "/computers")
        : Promise.resolve([] as RemoteComputer[]),
      syncUpdates
        ? fetchAllPages<RemoteUpdate>(server, "/updates")
        : Promise.resolve([] as RemoteUpdate[]),
      syncOverview
        ? fetchFromWsus<RemoteSyncOverview>(server, "/sync?limit=50")
        : Promise.resolve(null),
    ]);

    const computerDetails = syncClientPatches
      ? await fetchComputerDetailsInBatches(server, computers)
      : [];

    const updateApprovalMap = new Map<string, string>();
    if (syncClientPatches) {
      if (syncUpdates) {
        for (const u of updates) {
          updateApprovalMap.set(
            `${u.updateId}:${u.revisionNumber}`,
            u.isDeclined ? "Declined" : u.isApproved ? "Install" : "NotApproved"
          );
        }
      } else {
        const existingUpdates = await prisma.patchInventory.findMany({
          where: { serverName: server.name },
          select: {
            updateId: true,
            revisionNumber: true,
            isApproved: true,
            isDeclined: true,
          },
        });
        for (const u of existingUpdates) {
          updateApprovalMap.set(
            `${u.updateId}:${u.revisionNumber}`,
            u.isDeclined ? "Declined" : u.isApproved ? "Install" : "NotApproved"
          );
        }
      }
    }

    const clientPatchRows: Array<{
      serverName: string;
      computerName: string;
      computerTargetId: string;
      ipAddress: string;
      updateId: string;
      revisionNumber: number;
      updateTitle: string;
      kbArticle: string | null;
      classification: string;
      installationState: string;
      approvalAction: string;
      approvalTargetGroupId: string;
      errorCode: string | null;
      errorMessage: string | null;
    }> = [];

    const serverName = server.name;

    for (const detail of computerDetails) {
      const comp = detail.computer;
      const allUpdates = [
        ...(detail.failedUpdates ?? []),
        ...(detail.neededUpdates ?? []),
        ...(detail.pendingRebootUpdates ?? []),
        ...(detail.installedUpdates ?? []),
      ];
      for (const upd of allUpdates) {
        clientPatchRows.push({
          serverName,
          computerName: comp.fullDomainName,
          computerTargetId: comp.computerId,
          ipAddress: comp.ipAddress ?? "",
          updateId: upd.updateId,
          revisionNumber: upd.revisionNumber,
          updateTitle: upd.title,
          kbArticle: upd.kbArticle ?? null,
          classification: upd.classification ?? "Other",
          installationState: upd.installationState,
          approvalAction:
            updateApprovalMap.get(`${upd.updateId}:${upd.revisionNumber}`) ??
            "Unknown",
          approvalTargetGroupId: "",
          errorCode: upd.errorCode ?? null,
          errorMessage: upd.errorMessage ?? null,
        });
      }
    }

    await prisma.$transaction(async (tx) => {
      // 1. Replace ClientStatus for this server
      if (syncComputers) {
        await tx.clientStatus.deleteMany({ where: { serverName } });
        if (computers.length > 0) {
          await tx.clientStatus.createMany({
            data: computers.map((c) => ({
              serverName,
              computerTargetId: c.computerId,
              computerName: c.fullDomainName,
              ipAddress: c.ipAddress ?? "",
              osDescription: c.osDescription ?? "Unknown",
              osVersion: c.osVersion ?? null,
              clientVersion: c.clientVersion ?? "",
              computerRole: c.computerRole ?? "Workstation",
              requestedTargetGroup: c.requestedTargetGroup ?? null,
              assignedTargetGroups: (c.assignedTargetGroups ?? []).join(", "),
              lastSyncTime: c.lastSyncTimeUtc ? new Date(c.lastSyncTimeUtc) : null,
              lastReportedStatusTime: c.lastReportedStatusTimeUtc
                ? new Date(c.lastReportedStatusTimeUtc)
                : null,
            })),
          });
        }
      }

      // 2. Replace PatchInventory for this server (deduplicated by updateId & title)
      if (syncUpdates) {
        const dedupedUpdates = dedupePatchInventory(
          updates.map((u) => ({
            serverName,
            updateId: u.updateId,
            revisionNumber: u.revisionNumber,
            title: u.title,
            kbArticle: u.kbArticle ?? null,
            products: (u.products ?? []).join(", "),
            classification: u.classification ?? "Other",
            arrivalDate: u.arrivalDateUtc ? new Date(u.arrivalDateUtc) : null,
            creationDate: u.creationDateUtc ? new Date(u.creationDateUtc) : null,
            msrcSeverity: u.msrcSeverity ?? "Unspecified",
            isApproved: Boolean(u.isApproved),
            isDeclined: Boolean(u.isDeclined),
            isSuperseded: Boolean(u.isSuperseded),
            isLatestRevision: Boolean(u.isLatestRevision),
            updateType: u.updateType ?? "Software",
            description: "",
          }))
        );

        await tx.patchInventory.deleteMany({ where: { serverName } });
        if (dedupedUpdates.length > 0) {
          await tx.patchInventory.createMany({
            data: dedupedUpdates,
            skipDuplicates: true,
          });
        }
      }

      // 3. Upsert SynchronizationSetting
      if (syncOverview && syncRes) {
        const s = syncRes.data.settings;
        if (s) {
          const perDay = s.numberOfSynchronizationsPerDay || 1;
          await tx.synchronizationSetting.upsert({
            where: { serverName },
            create: {
              serverName,
              synchronizeAutomatically: Boolean(s.synchronizeAutomatically),
              synchronizationTimeUtc: s.synchronizationTimeOfDayUtc ?? "00:00:00",
              synchronizationTimeLocal: s.synchronizationTimeOfDayUtc ?? "00:00:00",
              syncPerDay: perDay,
              intervalHours: Math.max(1, Math.round(24 / perDay)),
              lastModifiedBy: "WSUS API Sync",
              lastModifiedTime: new Date(),
            },
            update: {
              synchronizeAutomatically: Boolean(s.synchronizeAutomatically),
              synchronizationTimeUtc: s.synchronizationTimeOfDayUtc ?? "00:00:00",
              synchronizationTimeLocal: s.synchronizationTimeOfDayUtc ?? "00:00:00",
              syncPerDay: perDay,
              intervalHours: Math.max(1, Math.round(24 / perDay)),
              lastModifiedBy: "WSUS API Sync",
              lastModifiedTime: new Date(),
            },
          });
        }
      }

      // 4. Replace ClientPatchStatus for this server (in chunks to avoid parameter limits)
      if (syncClientPatches) {
        await tx.clientPatchStatus.deleteMany({ where: { serverName } });
        const chunkSize = 2500;
        for (let i = 0; i < clientPatchRows.length; i += chunkSize) {
          await tx.clientPatchStatus.createMany({
            data: clientPatchRows.slice(i, i + chunkSize),
          });
        }
      }

      // 5. Replace SynchronizationHistory for this server
      if (syncOverview && syncRes) {
        const history = syncRes.data.history ?? [];
        await tx.synchronizationHistory.deleteMany({ where: { serverName } });
        if (history.length > 0) {
          await tx.synchronizationHistory.createMany({
            data: history.map((h) => ({
              serverName,
              synchronizationId: h.synchronizationId,
              startTime: h.startTimeUtc ? new Date(h.startTimeUtc) : null,
              endTime: h.endTimeUtc ? new Date(h.endTimeUtc) : null,
              result: h.result ?? "Unknown",
              startedManually: Boolean(h.startedManually),
              updateErrors:
                h.updateErrorsCount && h.updateErrorsCount > 0
                  ? `${h.updateErrorsCount} error(s)`
                  : null,
              error: h.error ?? null,
              errorText: h.errorText ?? null,
            })),
          });
        }
      }
    });

    await prisma.wsusServer.update({
      where: { id: server.id },
      data: {
        lastSyncedAt: new Date(),
        lastStatus: "Success",
        lastError: null,
      },
    });

    return {
      serverId: server.id,
      serverName: server.name,
      scope,
      computersCount: computers.length,
      updatesCount: updates.length,
      syncHistoryCount: syncRes?.data.history?.length ?? 0,
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    await prisma.wsusServer.update({
      where: { id: server.id },
      data: {
        lastStatus: "Failed",
        lastError: message,
      },
    });
    throw err;
  }
}

export async function startBackgroundSync(
  serverIds: number[],
  scope: SyncScope = "all"
) {
  const toStart = serverIds.filter((id) => !activeWsusSyncs.has(id));
  if (toStart.length === 0) {
    return { startedIds: [] as number[], alreadyRunningIds: serverIds };
  }

  await prisma.wsusServer.updateMany({
    where: { id: { in: toStart } },
    data: { lastStatus: "Syncing", lastError: null },
  });

  for (const id of toStart) {
    activeWsusSyncs.add(id);
    void syncWsusServerById(id, scope)
      .then(() => {
        try {
          revalidatePath("/", "layout");
        } catch {
          // revalidatePath may throw outside request context; UI polls & router.refresh() handles it
        }
      })
      .catch(() => {
        // Error is already persisted to WsusServer.lastStatus/lastError
      })
      .finally(() => {
        activeWsusSyncs.delete(id);
      });
  }

  return {
    startedIds: toStart,
    alreadyRunningIds: serverIds.filter((id) => !toStart.includes(id)),
  };
}
