import { parse } from "csv-parse/sync";
import { prisma } from "@/lib/prisma";

export type ImportMode = "replace" | "append";

export interface ImportFileResult {
  fileName: string;
  table: string;
  rowsParsed: number;
  rowsImported: number;
  status: "success" | "skipped" | "error";
  message?: string;
}

function parseDate(val?: string | null): Date | null {
  if (!val || !val.trim()) return null;
  const d = new Date(val.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseBool(val?: string | null): boolean {
  return val?.trim().toLowerCase() === "true";
}

function emptyToNull(val?: string | null): string | null {
  if (!val) return null;
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getServerName(row: Record<string, string>): string {
  return (row.ServerName ?? row.server_name ?? "").trim();
}

async function seedInBatches<T>(
  items: T[],
  batchSize: number,
  fn: (batch: T[]) => Promise<{ count: number }>
): Promise<number> {
  let total = 0;
  for (let i = 0; i < items.length; i += batchSize) {
    const res = await fn(items.slice(i, i + batchSize));
    total += res.count;
  }
  return total;
}

function parseCsvRecords(content: string): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const rows = parse(content, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
  }) as Record<string, string>[];
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { headers, rows };
}

function normalizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  return base.trim().toLowerCase();
}

export async function importCsvBuffer(
  rawName: string,
  buffer: Buffer,
  mode: ImportMode
): Promise<ImportFileResult> {
  const fileName = rawName.split(/[\\/]/).pop() ?? rawName;
  const key = normalizeFilename(rawName);
  const content = buffer.toString("utf8");

  let rows: Record<string, string>[];
  try {
    ({ rows } = parseCsvRecords(content));
  } catch (err) {
    return {
      fileName,
      table: "Unknown",
      rowsParsed: 0,
      rowsImported: 0,
      status: "error",
      message: err instanceof Error ? err.message : "Failed to parse CSV",
    };
  }

  try {
    switch (key) {
      case "classifications.csv": {
        if (mode === "replace") await prisma.classification.deleteMany();
        const res = await prisma.classification.createMany({
          data: rows.map((r) => ({
            serverName: getServerName(r),
            classificationId: r.ClassificationId,
            title: r.Title ?? "",
            description: r.Description ?? "",
            arrivalDate: parseDate(r.ArrivalDate),
            releaseNotes: emptyToNull(r.ReleaseNotes),
          })),
          skipDuplicates: true,
        });
        return {
          fileName,
          table: "Classification",
          rowsParsed: rows.length,
          rowsImported: res.count,
          status: "success",
        };
      }

      case "products.csv": {
        if (mode === "replace") await prisma.product.deleteMany();
        const res = await prisma.product.createMany({
          data: rows.map((r) => ({
            serverName: getServerName(r),
            categoryId: r.CategoryId,
            title: r.Title ?? "",
            type: r.Type ?? "",
            description: r.Description ?? "",
            arrivalDate: parseDate(r.ArrivalDate),
          })),
          skipDuplicates: true,
        });
        return {
          fileName,
          table: "Product",
          rowsParsed: rows.length,
          rowsImported: res.count,
          status: "success",
        };
      }

      case "client_status.csv": {
        if (mode === "replace") await prisma.clientStatus.deleteMany();
        const res = await prisma.clientStatus.createMany({
          data: rows.map((r) => ({
            serverName: getServerName(r),
            computerTargetId: r.ComputerTargetId,
            computerName: r.ComputerName ?? "",
            ipAddress: r.IPAddress ?? "",
            osDescription: r.OSDescription ?? "",
            osVersion: emptyToNull(r.OSVersion),
            clientVersion: r.ClientVersion ?? "",
            computerRole: r.ComputerRole ?? "",
            requestedTargetGroup: emptyToNull(r.RequestedTargetGroup),
            assignedTargetGroups: r.AssignedTargetGroups ?? "",
            lastSyncTime: parseDate(r.LastSyncTime),
            lastReportedStatusTime: parseDate(r.LastReportedStatusTime),
          })),
          skipDuplicates: true,
        });
        return {
          fileName,
          table: "ClientStatus",
          rowsParsed: rows.length,
          rowsImported: res.count,
          status: "success",
        };
      }

      case "patch_inventory.csv": {
        if (mode === "replace") await prisma.patchInventory.deleteMany();
        const count = await seedInBatches(rows, 1000, (batch) =>
          prisma.patchInventory.createMany({
            data: batch.map((r) => ({
              serverName: getServerName(r),
              updateId: r.UpdateId,
              revisionNumber: Number.parseInt(r.RevisionNumber, 10) || 0,
              title: r.Title ?? "",
              kbArticle: emptyToNull(r.KBArticle),
              products: emptyToNull(r.Products),
              classification: r.Classification ?? "",
              arrivalDate: parseDate(r.ArrivalDate),
              creationDate: parseDate(r.CreationDate),
              msrcSeverity: r.MsrcSeverity || "Unspecified",
              isApproved: parseBool(r.IsApproved),
              isDeclined: parseBool(r.IsDeclined),
              isSuperseded: parseBool(r.IsSuperseded),
              isLatestRevision: parseBool(r.IsLatestRevision),
              updateType: r.UpdateType ?? "",
              description: r.Description ?? "",
            })),
            skipDuplicates: true,
          })
        );
        return {
          fileName,
          table: "PatchInventory",
          rowsParsed: rows.length,
          rowsImported: count,
          status: "success",
        };
      }

      case "client_patch_status.csv": {
        if (mode === "replace") await prisma.clientPatchStatus.deleteMany();
        const count = await seedInBatches(rows, 1000, (batch) =>
          prisma.clientPatchStatus.createMany({
            data: batch.map((r) => ({
              serverName: getServerName(r),
              computerName: r.ComputerName ?? "",
              computerTargetId: r.ComputerTargetId ?? "",
              ipAddress: r.IPAddress ?? "",
              updateId: r.UpdateId ?? "",
              revisionNumber: Number.parseInt(r.RevisionNumber, 10) || 0,
              updateTitle: r.UpdateTitle ?? "",
              kbArticle: emptyToNull(r.KBArticle),
              classification: r.Classification ?? "",
              installationState: r.InstallationState ?? "Unknown",
              approvalAction: r.ApprovalAction ?? "",
              approvalTargetGroupId: r.ApprovalTargetGroupId ?? "",
            })),
          })
        );
        return {
          fileName,
          table: "ClientPatchStatus",
          rowsParsed: rows.length,
          rowsImported: count,
          status: "success",
        };
      }

      case "synchronization_history.csv": {
        if (mode === "replace") await prisma.synchronizationHistory.deleteMany();
        const res = await prisma.synchronizationHistory.createMany({
          data: rows.map((r) => ({
            serverName: getServerName(r),
            synchronizationId: r.SynchronizationId,
            startTime: parseDate(r.StartTime),
            endTime: parseDate(r.EndTime),
            result: r.Result ?? "",
            startedManually: parseBool(r.StartedManually),
            updateErrors: emptyToNull(r.UpdateErrors),
            error: emptyToNull(r.Error),
            errorText: emptyToNull(r.ErrorText),
          })),
          skipDuplicates: true,
        });
        return {
          fileName,
          table: "SynchronizationHistory",
          rowsParsed: rows.length,
          rowsImported: res.count,
          status: "success",
        };
      }

      case "synchronization_settings.csv": {
        if (mode === "replace") await prisma.synchronizationSetting.deleteMany();
        const res = await prisma.synchronizationSetting.createMany({
          data: rows.map((r) => ({
            serverName: getServerName(r),
            synchronizeAutomatically: parseBool(r.SynchronizeAutomatically),
            synchronizationTimeUtc: r.SynchronizationTimeUTC ?? "",
            synchronizationTimeLocal: r.SynchronizationTimeLocal ?? "",
            syncPerDay: Number.parseInt(r.SyncPerDay, 10) || 0,
            intervalHours: Number.parseInt(r.IntervalHours, 10) || 0,
            lastModifiedBy: r.LastModifiedBy ?? "",
            lastModifiedTime: parseDate(r.LastModifiedTime),
          })),
          skipDuplicates: true,
        });
        return {
          fileName,
          table: "SynchronizationSetting",
          rowsParsed: rows.length,
          rowsImported: res.count,
          status: "success",
        };
      }

      default:
        return {
          fileName,
          table: "Unrecognized",
          rowsParsed: rows.length,
          rowsImported: 0,
          status: "skipped",
          message: `Unrecognized WSUS CSV filename "${fileName}".`,
        };
    }
  } catch (err) {
    return {
      fileName,
      table: key,
      rowsParsed: rows.length,
      rowsImported: 0,
      status: "error",
      message: err instanceof Error ? err.message : "Database import failed",
    };
  }
}
