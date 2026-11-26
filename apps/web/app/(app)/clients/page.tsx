import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { ClientsTable, type ClientRow } from "./_components/clients-table";
import { computeDeviceCompliance, resolveClientOsVersion, type OsPatchHint } from "./_lib/wsus-compliance";

export const instant = false;

export const metadata: Metadata = {
  title: "Client Status",
};

export default async function ClientsPage() {
  const [clients, patchCounts, osPatches] = await Promise.all([
    prisma.clientStatus.findMany({
      orderBy: { computerName: "asc" },
    }),
    prisma.clientPatchStatus.groupBy({
      by: ["computerTargetId", "installationState"],
      _count: { id: true },
    }),
    prisma.clientPatchStatus.findMany({
      where: {
        OR: [
          { updateTitle: { contains: "Windows 11", mode: "insensitive" } },
          { updateTitle: { contains: "Windows 10", mode: "insensitive" } },
          { updateTitle: { contains: "server operating system", mode: "insensitive" } },
          { updateTitle: { contains: "Windows Server", mode: "insensitive" } },
        ],
      },
      select: {
        computerTargetId: true,
        updateTitle: true,
        classification: true,
        installationState: true,
      },
    }),
  ]);

  const osPatchesByClient = new Map<string, OsPatchHint[]>();
  for (const row of osPatches) {
    const list = osPatchesByClient.get(row.computerTargetId);
    if (list) list.push(row);
    else osPatchesByClient.set(row.computerTargetId, [row]);
  }

  const countsByClient = new Map<
    string,
    { installed: number; notApplicable: number; pending: number; failed: number; unknown: number }
  >();

  for (const row of patchCounts) {
    const entry = countsByClient.get(row.computerTargetId) ?? {
      installed: 0,
      notApplicable: 0,
      pending: 0,
      failed: 0,
      unknown: 0,
    };
    if (row.installationState === "Installed") entry.installed += row._count.id;
    else if (row.installationState === "NotApplicable") entry.notApplicable += row._count.id;
    else if (
      row.installationState === "NotInstalled" ||
      row.installationState === "Downloaded" ||
      row.installationState === "InstalledPendingReboot"
    )
      entry.pending += row._count.id;
    else if (row.installationState === "Failed") entry.failed += row._count.id;
    else if (row.installationState === "Unknown") entry.unknown += row._count.id;
    countsByClient.set(row.computerTargetId, entry);
  }

  const rows: ClientRow[] = clients.map((c) => {
    const patchCountsEntry = countsByClient.get(c.computerTargetId);
    const hasSummaryCounts =
      c.installedCount > 0 ||
      c.notApplicableCount > 0 ||
      c.neededCount > 0 ||
      c.failedCount > 0 ||
      c.pendingRebootCount > 0 ||
      c.unknownCount > 0;
    const counts = hasSummaryCounts
      ? {
          installed: Math.max(c.installedCount, patchCountsEntry?.installed ?? 0),
          notApplicable: Math.max(c.notApplicableCount, patchCountsEntry?.notApplicable ?? 0),
          pending: c.neededCount + c.pendingRebootCount,
          failed: c.failedCount,
          unknown: patchCountsEntry?.unknown ?? 0,
        }
      : {
          installed: patchCountsEntry?.installed ?? 0,
          notApplicable: patchCountsEntry?.notApplicable ?? 0,
          pending: patchCountsEntry?.pending ?? 0,
          failed: patchCountsEntry?.failed ?? 0,
          unknown: patchCountsEntry?.unknown ?? 0,
        };
    const { applicable, score, isFullyCompliant } =
      computeDeviceCompliance(counts);
    return {
      serverName: c.serverName,
      computerTargetId: c.computerTargetId,
      computerName: c.computerName,
      ipAddress: c.ipAddress,
      osDescription: resolveClientOsVersion({
        osDescription: c.osDescription,
        osVersion: c.osVersion,
        patches: osPatchesByClient.get(c.computerTargetId),
      }),
      clientVersion: c.clientVersion,
      computerRole: c.computerRole,
      assignedTargetGroups: c.assignedTargetGroups,
      lastSyncTime: c.lastSyncTime ? c.lastSyncTime.toISOString() : null,
      lastReportedStatusTime: c.lastReportedStatusTime
        ? c.lastReportedStatusTime.toISOString()
        : null,
      installed: counts.installed,
      notInstalled: counts.pending,
      failed: counts.failed,
      applicable,
      complianceScore: score,
      isFullyCompliant,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Client Status</h1>
        <p className="text-muted-foreground">
          All {rows.length} managed endpoints and their patch compliance summary.
        </p>
      </div>
      <ClientsTable clients={rows} />
    </div>
  );
}
