import type { Metadata } from "next";
import Link from "next/link";
import {
  Monitor,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/ui/card";
import { Badge } from "@workspace/ui/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/ui/table";
import { DashboardCharts } from "./_components/dashboard-charts";

export const instant = false;

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const [
    totalClients,
    patchTotalsRows,
    stateGroups,
    severityRows,
    recentSyncs,
    attentionClientsRaw,
  ] = await Promise.all([
    prisma.clientStatus.count(),
    prisma.$queryRaw<Array<{ total: bigint; approved: bigint }>>`
      SELECT
        COUNT(DISTINCT "updateId") AS "total",
        COUNT(DISTINCT CASE WHEN "isApproved" = true THEN "updateId" END) AS "approved"
      FROM "PatchInventory"
      WHERE "isDeclined" = false
        AND "isSuperseded" = false
        AND "isLatestRevision" = true
    `,
    prisma.clientPatchStatus.groupBy({
      by: ["installationState"],
      _count: { installationState: true },
      orderBy: { _count: { installationState: "desc" } },
    }),
    prisma.$queryRaw<Array<{ severity: string; count: bigint }>>`
      SELECT
        "msrcSeverity" AS "severity",
        COUNT(DISTINCT "updateId") AS "count"
      FROM "PatchInventory"
      WHERE "isDeclined" = false
        AND "isSuperseded" = false
        AND "isLatestRevision" = true
      GROUP BY "msrcSeverity"
      ORDER BY "count" DESC
    `,
    prisma.synchronizationHistory.findMany({
      orderBy: { startTime: "desc" },
      take: 5,
    }),
    prisma.clientPatchStatus.groupBy({
      by: ["computerTargetId", "computerName", "installationState"],
      where: {
        installationState: { in: ["Failed", "NotInstalled"] },
      },
      _count: { id: true },
    }),
  ]);

  const totalPatches = Number(patchTotalsRows[0]?.total ?? 0);
  const approvedPatches = Number(patchTotalsRows[0]?.approved ?? 0);

  const stateMap = new Map(
    stateGroups.map((g) => [g.installationState, g._count.installationState])
  );
  const installedCount = stateMap.get("Installed") ?? 0;
  const notInstalledCount = stateMap.get("NotInstalled") ?? 0;
  const failedCount = stateMap.get("Failed") ?? 0;

  const stateData = stateGroups.map((g) => ({
    state: g.installationState,
    count: g._count.installationState,
  }));

  const severityData = severityRows.map((g) => ({
    severity: g.severity,
    count: Number(g.count),
  }));

  // Aggregate Failed + NotInstalled per client
  const clientAgg = new Map<
    string,
    { id: string; name: string; failed: number; notInstalled: number }
  >();
  for (const row of attentionClientsRaw) {
    const existing = clientAgg.get(row.computerTargetId) ?? {
      id: row.computerTargetId,
      name: row.computerName,
      failed: 0,
      notInstalled: 0,
    };
    if (row.installationState === "Failed") existing.failed += row._count.id;
    if (row.installationState === "NotInstalled")
      existing.notInstalled += row._count.id;
    clientAgg.set(row.computerTargetId, existing);
  }
  const attentionClients = Array.from(clientAgg.values())
    .sort((a, b) => b.failed - a.failed || b.notInstalled - a.notInstalled)
    .slice(0, 6);

  const latestSync = recentSyncs[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">WSUS Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of managed endpoints, patch compliance, and synchronization status.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Managed Clients</CardTitle>
            <Monitor className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalClients}</div>
            <p className="text-xs text-muted-foreground">
              Active Windows endpoints
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Patch Inventory</CardTitle>
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalPatches.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              {approvedPatches.toLocaleString()} approved for deployment
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Installed / Pending
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {installedCount.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              <span className="text-amber-600 font-medium">
                {notInstalledCount} not installed
              </span>{" "}
              &middot;{" "}
              <span className="text-destructive font-medium">
                {failedCount} failed
              </span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Latest Sync</CardTitle>
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">
                {latestSync?.result ?? "N/A"}
              </span>
              {latestSync?.result === "Succeeded" && (
                <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-700">
                  Healthy
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {latestSync?.startTime
                ? latestSync.startTime.toISOString().replace("T", " ").slice(0, 19)
                : "No sync history"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <DashboardCharts stateData={stateData} severityData={severityData} />

      {/* Bottom Tables */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Clients Needing Attention
              </CardTitle>
              <CardDescription>
                Top endpoints with failed or pending updates
              </CardDescription>
            </div>
            <Link
              href="/clients"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Computer Name</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead className="text-right">Not Installed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attentionClients.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/clients/${c.id}`}
                        className="hover:underline text-primary"
                      >
                        {c.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">
                      {c.failed > 0 ? (
                        <Badge variant="destructive">{c.failed}</Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline">{c.notInstalled}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Synchronizations</CardTitle>
              <CardDescription>Last 5 WSUS catalog sync runs</CardDescription>
            </div>
            <Link
              href="/sync"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              View history <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Start Time</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead className="text-right">Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentSyncs.map((s) => (
                  <TableRow key={s.synchronizationId}>
                    <TableCell className="font-mono text-xs">
                      {s.startTime
                        ? s.startTime.toISOString().replace("T", " ").slice(0, 19)
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {s.startedManually ? "Manual" : "Scheduled"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant="secondary"
                        className={
                          s.result === "Succeeded"
                            ? "bg-emerald-500/15 text-emerald-700"
                            : "bg-destructive/15 text-destructive"
                        }
                      >
                        {s.result}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
