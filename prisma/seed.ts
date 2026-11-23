import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(".env");
  } catch {
    // ignore if already loaded
  }
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

function readCsv<T extends Record<string, string>>(filename: string): T[] {
  const filePath = path.join(process.cwd(), "data", filename);
  const content = fs.readFileSync(filePath, "utf8");
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
  }) as T[];
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

async function seedInBatches<T>(
  items: T[],
  batchSize: number,
  fn: (batch: T[]) => Promise<unknown>
) {
  for (let i = 0; i < items.length; i += batchSize) {
    await fn(items.slice(i, i + batchSize));
  }
}

async function main() {
  console.log("Seeding default admin user...");
  const passwordHash = await bcrypt.hash("P@ssw0rd", 10);
  await prisma.user.upsert({
    where: { username: "admin" },
    update: { passwordHash, role: "admin" },
    create: { username: "admin", passwordHash, role: "admin" },
  });

  console.log("Seeding Classifications...");
  const classifications = readCsv("Classifications.csv");
  await prisma.classification.createMany({
    data: classifications.map((r) => ({
      classificationId: r.ClassificationId,
      title: r.Title,
      description: r.Description ?? "",
      arrivalDate: parseDate(r.ArrivalDate),
      releaseNotes: emptyToNull(r.ReleaseNotes),
    })),
    skipDuplicates: true,
  });

  console.log("Seeding Products...");
  const products = readCsv("Products.csv");
  await prisma.product.createMany({
    data: products.map((r) => ({
      categoryId: r.CategoryId,
      title: r.Title,
      type: r.Type,
      description: r.Description ?? "",
      arrivalDate: parseDate(r.ArrivalDate),
    })),
    skipDuplicates: true,
  });

  console.log("Seeding ClientStatus...");
  const clients = readCsv("Client_Status.csv");
  await prisma.clientStatus.createMany({
    data: clients.map((r) => ({
      computerTargetId: r.ComputerTargetId,
      computerName: r.ComputerName,
      ipAddress: r.IPAddress,
      osDescription: r.OSDescription,
      osVersion: emptyToNull(r.OSVersion),
      clientVersion: r.ClientVersion,
      computerRole: r.ComputerRole,
      requestedTargetGroup: emptyToNull(r.RequestedTargetGroup),
      assignedTargetGroups: r.AssignedTargetGroups ?? "",
      lastSyncTime: parseDate(r.LastSyncTime),
      lastReportedStatusTime: parseDate(r.LastReportedStatusTime),
    })),
    skipDuplicates: true,
  });

  console.log("Seeding PatchInventory...");
  const patches = readCsv("Patch_Inventory.csv");
  await seedInBatches(patches, 1000, (batch) =>
    prisma.patchInventory.createMany({
      data: batch.map((r) => ({
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

  console.log("Seeding ClientPatchStatus...");
  const existingCpsCount = await prisma.clientPatchStatus.count();
  if (existingCpsCount === 0) {
    const clientPatches = readCsv("Client_Patch_Status.csv");
    await seedInBatches(clientPatches, 1000, (batch) =>
      prisma.clientPatchStatus.createMany({
        data: batch.map((r) => ({
          computerName: r.ComputerName,
          computerTargetId: r.ComputerTargetId,
          ipAddress: r.IPAddress,
          updateId: r.UpdateId,
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
  }

  console.log("Seeding SynchronizationHistory...");
  const syncHistory = readCsv("Synchronization_History.csv");
  await prisma.synchronizationHistory.createMany({
    data: syncHistory.map((r) => ({
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

  console.log("Seeding SynchronizationSetting...");
  const syncSettings = readCsv("Synchronization_Settings.csv");
  await prisma.synchronizationSetting.createMany({
    data: syncSettings.map((r) => ({
      serverName: r.ServerName,
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

  const counts = {
    users: await prisma.user.count(),
    classifications: await prisma.classification.count(),
    products: await prisma.product.count(),
    clientStatus: await prisma.clientStatus.count(),
    patchInventory: await prisma.patchInventory.count(),
    clientPatchStatus: await prisma.clientPatchStatus.count(),
    synchronizationHistory: await prisma.synchronizationHistory.count(),
    synchronizationSetting: await prisma.synchronizationSetting.count(),
  };
  console.log("Seed complete. Table counts:", counts);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
