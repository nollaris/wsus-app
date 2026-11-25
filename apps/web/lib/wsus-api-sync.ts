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

const WSUS_REQUEST_INTERVAL_MS = 250;

export interface SyncLimits {
  /** Maximum number of computers to fetch from /computers (0 or undefined = unlimited) */
  maxComputers?: number;
  /** Maximum number of updates to fetch from /updates (0 or undefined = unlimited) */
  maxUpdates?: number;
  /** Maximum number of computers to query /computers/{id} for during client-patches sync */
  maxClientDetailComputers?: number;
  /** Page size for paginated endpoints (1..500, default 500) */
  pageSize?: number;
  /** Max concurrent requests to the WSUS API (1..16, default 4) */
  concurrency?: number;
  /** Per-request HTTP timeout in ms (1000..120000, default 120000) */
  requestTimeoutMs?: number;
  /** Only fetch approved, non-declined updates from /updates */
  approvedUpdatesOnly?: boolean;
  /** Skip Installed updates when syncing client-patches to reduce payload & DB writes */
  skipInstalledClientPatches?: boolean;
}

interface ResolvedSyncLimits {
  maxComputers: number | null;
  maxUpdates: number | null;
  maxClientDetailComputers: number | null;
  pageSize: number;
  concurrency: number;
  requestTimeoutMs: number;
  approvedUpdatesOnly: boolean;
  skipInstalledClientPatches: boolean;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function positiveLimitOrNull(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const n = Math.trunc(value);
  return n > 0 ? n : null;
}

function envInt(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function resolveSyncLimits(limits?: SyncLimits): ResolvedSyncLimits {
  return {
    maxComputers: positiveLimitOrNull(limits?.maxComputers ?? envInt("WSUS_SYNC_MAX_COMPUTERS")),
    maxUpdates: positiveLimitOrNull(limits?.maxUpdates ?? envInt("WSUS_SYNC_MAX_UPDATES")),
    maxClientDetailComputers: positiveLimitOrNull(
      limits?.maxClientDetailComputers ?? envInt("WSUS_SYNC_MAX_CLIENT_DETAILS")
    ),
    pageSize: clampInt(limits?.pageSize ?? envInt("WSUS_SYNC_PAGE_SIZE"), 1, 500, 500),
    concurrency: clampInt(limits?.concurrency ?? envInt("WSUS_SYNC_CONCURRENCY"), 1, 16, 4),
    requestTimeoutMs: clampInt(
      limits?.requestTimeoutMs ?? envInt("WSUS_SYNC_TIMEOUT_MS"),
      1000,
      120000,
      120000
    ),
    approvedUpdatesOnly: Boolean(limits?.approvedUpdatesOnly),
    skipInstalledClientPatches: Boolean(limits?.skipInstalledClientPatches),
  };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  if (signal?.aborted) {
    return Promise.reject(new DOMException("Sync cancelled by user", "AbortError"));
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new DOMException("Sync cancelled by user", "AbortError"));
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function isValidSyncScope(value: unknown): value is SyncScope {
  return (
    typeof value === "string" &&
    (SYNC_SCOPES as readonly string[]).includes(value)
  );
}

const globalForSync = globalThis as unknown as {
  activeWsusSyncs?: Map<number, AbortController>;
  wsusRequestNextAllowedAt?: Map<string, number>;
};
const activeWsusSyncs =
  globalForSync.activeWsusSyncs instanceof Map
    ? globalForSync.activeWsusSyncs
    : (globalForSync.activeWsusSyncs = new Map<number, AbortController>());
const wsusRequestNextAllowedAt =
  globalForSync.wsusRequestNextAllowedAt instanceof Map
    ? globalForSync.wsusRequestNextAllowedAt
    : (globalForSync.wsusRequestNextAllowedAt = new Map<string, number>());

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

async function waitForWsusRequestSlot(
  baseUrl: string,
  signal?: AbortSignal
): Promise<void> {
  if (signal?.aborted) {
    throw new DOMException("Sync cancelled by user", "AbortError");
  }

  const key = normalizeBaseUrl(baseUrl);
  const now = Date.now();
  const scheduledAt = Math.max(now, wsusRequestNextAllowedAt.get(key) ?? now);
  wsusRequestNextAllowedAt.set(key, scheduledAt + WSUS_REQUEST_INTERVAL_MS);
  await sleep(scheduledAt - now, signal);
}

async function fetchFromWsus<T>(
  server: { baseUrl: string; apiKey: string },
  path: string,
  timeoutMs = 120000,
  signal?: AbortSignal
): Promise<WsusApiEnvelope<T>> {
  await waitForWsusRequestSlot(server.baseUrl, signal);

  const url = `${normalizeBaseUrl(server.baseUrl)}${path}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Api-Key": server.apiKey,
  };

  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const combinedSignal = signal
    ? AbortSignal.any([timeoutSignal, signal])
    : timeoutSignal;

  const res = await fetch(url, {
    method: "GET",
    headers,
    cache: "no-store",
    signal: combinedSignal,
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
  }>(server, "/health", 15000);
  return res.data;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      if (signal?.aborted) {
        throw new DOMException("Sync cancelled by user", "AbortError");
      }
      const idx = nextIndex++;
      if (idx >= items.length) break;
      results[idx] = await worker(items[idx]!, idx);
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

async function fetchAllPages<T>(
  server: { baseUrl: string; apiKey: string },
  resourcePath: string,
  options: {
    pageSize: number;
    maxItems: number | null;
    concurrency: number;
    timeoutMs: number;
    signal?: AbortSignal;
  }
): Promise<T[]> {
  const effectivePageSize =
    options.maxItems !== null
      ? Math.min(options.pageSize, options.maxItems)
      : options.pageSize;
  const sep = resourcePath.includes("?") ? "&" : "?";
  const firstRes = await fetchFromWsus<T[]>(
    server,
    `${resourcePath}${sep}page=1&pageSize=${effectivePageSize}`,
    options.timeoutMs,
    options.signal
  );

  const items: T[] = [...firstRes.data];
  if (options.maxItems !== null && items.length >= options.maxItems) {
    return items.slice(0, options.maxItems);
  }

  const totalPages = firstRes.meta?.pagination?.totalPages ?? 1;
  const maxPagesAllowed =
    options.maxItems !== null
      ? Math.ceil(options.maxItems / effectivePageSize)
      : totalPages;
  const pagesToFetch = Math.min(totalPages, maxPagesAllowed);

  if (pagesToFetch <= 1) {
    return items;
  }

  const remainingPages = Array.from(
    { length: pagesToFetch - 1 },
    (_, i) => i + 2
  );
  const pageResults = await mapWithConcurrency(
    remainingPages,
    options.concurrency,
    async (page) => {
      const res = await fetchFromWsus<T[]>(
        server,
        `${resourcePath}${sep}page=${page}&pageSize=${effectivePageSize}`,
        options.timeoutMs,
        options.signal
      );
      return res.data;
    },
    options.signal
  );

  for (const pageItems of pageResults) {
    items.push(...pageItems);
  }
  return options.maxItems !== null ? items.slice(0, options.maxItems) : items;
}

async function fetchComputerDetailsInBatches(
  server: { baseUrl: string; apiKey: string },
  computers: RemoteComputer[],
  options: {
    maxComputers: number | null;
    concurrency: number;
    timeoutMs: number;
    includeInstalled: boolean;
    signal?: AbortSignal;
  }
): Promise<RemoteComputerDetail[]> {
  const targetComputers =
    options.maxComputers !== null
      ? computers.slice(0, options.maxComputers)
      : computers;
  const query = options.includeInstalled ? "" : "?includeInstalled=false";

  const results = await mapWithConcurrency(
    targetComputers,
    options.concurrency,
    async (c) => {
      if (options.signal?.aborted) {
        throw new DOMException("Sync cancelled by user", "AbortError");
      }
      try {
        const res = await fetchFromWsus<RemoteComputerDetail>(
          server,
          `/computers/${encodeURIComponent(c.computerId)}${query}`,
          options.timeoutMs,
          options.signal
        );
        return res.data;
      } catch (err) {
        if (options.signal?.aborted || (err instanceof Error && err.name === "AbortError")) {
          throw err;
        }
        return null;
      }
    },
    options.signal
  );

  return results.filter((item): item is RemoteComputerDetail => item !== null);
}

export async function syncWsusServerById(
  serverId: number,
  scope: SyncScope = "all",
  rawLimits?: SyncLimits,
  signal?: AbortSignal
) {
  const limits = resolveSyncLimits(rawLimits);
  const server = await prisma.wsusServer.findUnique({ where: { id: serverId } });
  if (!server) {
    throw new Error("WSUS server not found");
  }

  const syncComputers = scope === "all" || scope === "computers";
  const syncUpdates = scope === "all" || scope === "updates";
  const syncOverview = scope === "all" || scope === "sync";
  const syncClientPatches = scope === "all" || scope === "client-patches";

  const updatesPath = limits.approvedUpdatesOnly
    ? "/updates?approved=true&declined=false"
    : "/updates";

  const startedAt = Date.now();
  try {
    const [computers, updates, syncRes] = await Promise.all([
      syncComputers || syncClientPatches
        ? fetchAllPages<RemoteComputer>(server, "/computers", {
            pageSize: limits.pageSize,
            maxItems: limits.maxComputers,
            concurrency: limits.concurrency,
            timeoutMs: limits.requestTimeoutMs,
            signal,
          })
        : Promise.resolve([] as RemoteComputer[]),
      syncUpdates
        ? fetchAllPages<RemoteUpdate>(server, updatesPath, {
            pageSize: limits.pageSize,
            maxItems: limits.maxUpdates,
            concurrency: limits.concurrency,
            timeoutMs: limits.requestTimeoutMs,
            signal,
          })
        : Promise.resolve([] as RemoteUpdate[]),
      syncOverview
        ? fetchFromWsus<RemoteSyncOverview>(
            server,
            "/sync?limit=50",
            limits.requestTimeoutMs,
            signal
          )
        : Promise.resolve(null),
    ]);

    if (signal?.aborted) {
      throw new DOMException("Sync cancelled by user", "AbortError");
    }

    const computerDetails = syncClientPatches
      ? await fetchComputerDetailsInBatches(server, computers, {
          maxComputers: limits.maxClientDetailComputers,
          concurrency: limits.concurrency,
          timeoutMs: limits.requestTimeoutMs,
          includeInstalled: !limits.skipInstalledClientPatches,
          signal,
        })
      : [];

    if (signal?.aborted) {
      throw new DOMException("Sync cancelled by user", "AbortError");
    }

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
        ...(limits.skipInstalledClientPatches ? [] : (detail.installedUpdates ?? [])),
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

    const dedupedUpdates = syncUpdates
      ? dedupePatchInventory(
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
        )
      : [];

    const productDates = new Map<string, { title: string; arrivalDate: Date | null }>();
    const classificationDates = new Map<string, { title: string; arrivalDate: Date | null }>();

    if (syncUpdates) {
      for (const u of updates) {
        const arrivalDate = u.arrivalDateUtc ? new Date(u.arrivalDateUtc) : null;

        for (const rawProduct of u.products ?? []) {
          const title = rawProduct.trim();
          if (!title) continue;
          const key = title.toLowerCase();
          const existing = productDates.get(key);
          if (!existing || (arrivalDate && (!existing.arrivalDate || arrivalDate > existing.arrivalDate))) {
            productDates.set(key, { title, arrivalDate });
          }
        }

        const classTitle = (u.classification ?? "").trim() || "Other";
        const classKey = classTitle.toLowerCase();
        const existingClass = classificationDates.get(classKey);
        if (!existingClass || (arrivalDate && (!existingClass.arrivalDate || arrivalDate > existingClass.arrivalDate))) {
          classificationDates.set(classKey, { title: classTitle, arrivalDate });
        }
      }
    }

    await prisma.$transaction(
      async (tx) => {
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
          await tx.patchInventory.deleteMany({ where: { serverName } });
          const patchChunkSize = 2500;
          for (let i = 0; i < dedupedUpdates.length; i += patchChunkSize) {
            await tx.patchInventory.createMany({
              data: dedupedUpdates.slice(i, i + patchChunkSize),
              skipDuplicates: true,
            });
          }

          await tx.product.deleteMany({ where: { serverName } });
          if (productDates.size > 0) {
            await tx.product.createMany({
              data: Array.from(productDates.entries()).map(([categoryId, info]) => ({
                serverName,
                categoryId,
                title: info.title,
                type: "Product",
                description: "",
                arrivalDate: info.arrivalDate,
              })),
              skipDuplicates: true,
            });
          }

          await tx.classification.deleteMany({ where: { serverName } });
          if (classificationDates.size > 0) {
            await tx.classification.createMany({
              data: Array.from(classificationDates.entries()).map(([classificationId, info]) => ({
                serverName,
                classificationId,
                title: info.title,
                description: "",
                arrivalDate: info.arrivalDate,
                releaseNotes: null,
              })),
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
      },
      { maxWait: 10000, timeout: 120000 }
    );

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
    const isCancelled =
      signal?.aborted ||
      (err instanceof Error && err.name === "AbortError");
    const isTimeout =
      err instanceof Error &&
      (err.name === "TimeoutError" || /timed?\s*out|timeout/i.test(err.message));
    const message = isCancelled
      ? "Sync cancelled by user"
      : isTimeout
        ? `WSUS API request timed out after ${Math.round(limits.requestTimeoutMs / 1000)} seconds. This is a response-timeout, not an API-key rejection. Check WSUS/network responsiveness or adjust the request timeout.`
      : err instanceof Error
        ? err.message
        : "Sync failed";
    await prisma.wsusServer.update({
      where: { id: server.id },
      data: {
        lastStatus: isCancelled ? "Cancelled" : "Failed",
        lastError: message,
      },
    });
    throw err;
  }
}

export async function startBackgroundSync(
  serverIds: number[],
  scope: SyncScope = "all",
  limits?: SyncLimits
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
    const controller = new AbortController();
    activeWsusSyncs.set(id, controller);
    void syncWsusServerById(id, scope, limits, controller.signal)
      .then(() => {
        try {
          revalidatePath("/", "layout");
        } catch {
          // revalidatePath may throw outside request context; UI polls & router.refresh() handles it
        }
      })
      .catch(() => {
        // Error or cancellation is already persisted to WsusServer.lastStatus/lastError
      })
      .finally(() => {
        if (activeWsusSyncs.get(id) === controller) {
          activeWsusSyncs.delete(id);
        }
      });
  }

  return {
    startedIds: toStart,
    alreadyRunningIds: serverIds.filter((id) => !toStart.includes(id)),
  };
}

export async function cancelBackgroundSync(serverIds?: number[]) {
  const targets =
    serverIds && serverIds.length > 0
      ? serverIds
      : Array.from(activeWsusSyncs.keys());

  const cancelledIds: number[] = [];
  for (const id of targets) {
    const controller = activeWsusSyncs.get(id);
    if (controller) {
      controller.abort();
      activeWsusSyncs.delete(id);
      cancelledIds.push(id);
    }
  }

  await prisma.wsusServer.updateMany({
    where: {
      ...(serverIds && serverIds.length > 0 ? { id: { in: serverIds } } : {}),
      lastStatus: "Syncing",
    },
    data: {
      lastStatus: "Cancelled",
      lastError: "Sync cancelled by user",
    },
  });

  return { cancelledIds };
}
