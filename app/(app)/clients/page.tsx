import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { ClientsTable, type ClientRow } from "@/components/clients-table";
import { computeDeviceCompliance } from "@/lib/wsus-compliance";

export const instant = false;

export const metadata: Metadata = {
  title: "Client Status",
};

export default async function ClientsPage() {
  const [clients, patchCounts] = await Promise.all([
    prisma.clientStatus.findMany({
      orderBy: { computerName: "asc" },
    }),
    prisma.clientPatchStatus.groupBy({
      by: ["computerTargetId", "installationState"],
      _count: { id: true },
    }),
  ]);

  const countsByClient = new Map<
    string,
    { installed: number; pending: number; failed: number; unknown: number }
  >();

  for (const row of patchCounts) {
    const entry = countsByClient.get(row.computerTargetId) ?? {
      installed: 0,
      pending: 0,
      failed: 0,
      unknown: 0,
    };
    if (row.installationState === "Installed") entry.installed += row._count.id;
    else if (
      row.installationState === "NotInstalled" ||
      row.installationState === "Downloaded"
    )
      entry.pending += row._count.id;
    else if (row.installationState === "Failed") entry.failed += row._count.id;
    else if (row.installationState === "Unknown") entry.unknown += row._count.id;
    countsByClient.set(row.computerTargetId, entry);
  }

  const rows: ClientRow[] = clients.map((c) => {
    const counts = countsByClient.get(c.computerTargetId) ?? {
      installed: 0,
      pending: 0,
      failed: 0,
      unknown: 0,
    };
    const { applicable, score, isFullyCompliant } =
      computeDeviceCompliance(counts);
    return {
      serverName: c.serverName,
      computerTargetId: c.computerTargetId,
      computerName: c.computerName,
      ipAddress: c.ipAddress,
      osDescription: c.osDescription,
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
