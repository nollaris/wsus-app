import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Database,
  Monitor,
  PackageCheck,
  RefreshCw,
  Server as ServerIcon,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatBangkokTimestamp } from "@/lib/format";
import { getSession } from "@/lib/auth";
import { SyncHistoryTable } from "./_components/sync-history-table";
import { WsusServerControl } from "./_components/wsus-server-control";
import { Badge } from "@workspace/ui/components/ui/badge";
import { Button } from "@workspace/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/ui/card";

export const instant = false;

function formatSyncTimestamp(value: Date | null) {
  return formatBangkokTimestamp(value, "Never");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const serverId = Number(id);
  if (!Number.isInteger(serverId) || serverId <= 0) {
    return { title: "Server Not Found" };
  }
  const server = await prisma.wsusServer.findUnique({
    where: { id: serverId },
    select: { name: true },
  });
  return {
    title: server ? `${server.name} · Server Control` : "Server Not Found",
  };
}

export default async function ServerControlPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const serverId = Number(id);
  if (!Number.isInteger(serverId) || serverId <= 0) {
    notFound();
  }

  const [session, server] = await Promise.all([
    getSession(),
    prisma.wsusServer.findUnique({
      where: { id: serverId },
      select: {
        id: true,
        name: true,
        baseUrl: true,
        enabled: true,
        lastSyncedAt: true,
        lastStatus: true,
        lastError: true,
        createdAt: true,
      },
    }),
  ]);

  if (!server) {
    notFound();
  }

  const [
    syncSetting,
    syncHistory,
    clientsCount,
    patchesCount,
    clientPatchesCount,
    productsCount,
    classificationsCount,
  ] = await Promise.all([
    prisma.synchronizationSetting.findUnique({
      where: { serverName: server.name },
    }),
    prisma.synchronizationHistory.findMany({
      where: { serverName: server.name },
      orderBy: { startTime: "desc" },
    }),
    prisma.clientStatus.count({ where: { serverName: server.name } }),
    prisma.patchInventory.count({ where: { serverName: server.name } }),
    prisma.clientPatchStatus.count({ where: { serverName: server.name } }),
    prisma.product.count({ where: { serverName: server.name } }),
    prisma.classification.count({ where: { serverName: server.name } }),
  ]);

  const serializedServer = {
    id: server.id,
    name: server.name,
    baseUrl: server.baseUrl,
    enabled: server.enabled,
    lastSyncedAt: server.lastSyncedAt ? server.lastSyncedAt.toISOString() : null,
    lastStatus: server.lastStatus,
    lastError: server.lastError,
  };

  const serializedHistory = syncHistory.map((h) => ({
    serverName: h.serverName,
    synchronizationId: h.synchronizationId,
    startTime: h.startTime ? h.startTime.toISOString() : null,
    endTime: h.endTime ? h.endTime.toISOString() : null,
    result: h.result,
    startedManually: h.startedManually,
    error: h.error,
    errorText: h.errorText,
  }));
  const metrics = [
    {
      label: "Managed clients",
      value: clientsCount.toLocaleString(),
      icon: Monitor,
    },
    {
      label: "Patch inventory",
      value: patchesCount.toLocaleString(),
      icon: ShieldAlert,
    },
    {
      label: "Client patch records",
      value: clientPatchesCount.toLocaleString(),
      icon: Database,
    },
    {
      label: "Products / classifications",
      value: `${productsCount.toLocaleString()} / ${classificationsCount.toLocaleString()}`,
      icon: PackageCheck,
    },
  ];
  const synchronizationContent = (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Upstream schedule</CardTitle>
              <CardDescription className="mt-1">
                WSUS schedule settings imported from this server.
              </CardDescription>
            </div>
            {syncSetting && (
              <Badge
                variant={
                  syncSetting.synchronizeAutomatically ? "secondary" : "outline"
                }
                className={
                  syncSetting.synchronizeAutomatically
                    ? "bg-emerald-500/15 text-emerald-700"
                    : ""
                }
              >
                {syncSetting.synchronizeAutomatically ? "Automatic" : "Manual"}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {syncSetting ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">
                  Synchronization time (UTC)
                </p>
                <p className="mt-1 font-mono text-sm">
                  {syncSetting.synchronizationTimeUtc}
                </p>
              </div>
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Frequency</p>
                <p className="mt-1 text-sm font-medium">
                  {syncSetting.syncPerDay} times/day · every{" "}
                  {syncSetting.intervalHours}h
                </p>
              </div>
              <div className="text-xs text-muted-foreground">
                Last updated by{" "}
                <span className="font-medium text-foreground">
                  {syncSetting.lastModifiedBy || "Unknown"}
                </span>
                {syncSetting.lastModifiedTime && (
                  <>
                    {" "}
                    · {formatSyncTimestamp(syncSetting.lastModifiedTime)}
                  </>
                )}
              </div>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
              No schedule data imported yet. Run a Sync History or Full Sync to
              load the server settings.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Recent synchronization runs</CardTitle>
          <CardDescription>
            {serializedHistory.length.toLocaleString()} records · Timestamp (UTC+7)
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          <SyncHistoryTable rows={serializedHistory} />
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 h-8 px-2 text-muted-foreground"
          nativeButton={false}
          render={<Link href="/sync" />}
        >
          <ArrowLeft className="mr-1 size-4" />
          All WSUS servers
        </Button>

        <section className="rounded-2xl border bg-gradient-to-br from-card via-card to-muted/50 p-5 sm:p-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ServerIcon className="size-6" />
              </div>
              <div className="min-w-0 space-y-1">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  WSUS server · ID {server.id}
                </p>
                <h1 className="truncate text-3xl font-bold tracking-tight">
                  {server.name}
                </h1>
                <p className="break-all font-mono text-xs text-muted-foreground">
                  {server.baseUrl}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <Badge variant={server.enabled ? "secondary" : "outline"}>
                {server.enabled ? "Enabled" : "Disabled"}
              </Badge>
              {server.lastStatus === "Success" ? (
                <Badge
                  variant="secondary"
                  className="bg-emerald-500/15 text-emerald-700"
                >
                  <CheckCircle2 />
                  Synced
                </Badge>
              ) : server.lastStatus === "Partial" ? (
                <Badge
                  variant="outline"
                  className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                >
                  <AlertTriangle />
                  Partial
                </Badge>
              ) : server.lastStatus === "Failed" ? (
                <Badge variant="destructive">
                  <XCircle />
                  Failed
                </Badge>
              ) : server.lastStatus === "Syncing" ? (
                <Badge variant="outline" className="border-sky-500/40 text-sky-700">
                  <RefreshCw className="animate-spin" />
                  Syncing
                </Badge>
              ) : (
                <Badge variant="outline">
                  <Clock />
                  {server.lastStatus ?? "Not synced"}
                </Badge>
              )}
            </div>
          </div>

          <div className="mt-5 border-t pt-4 text-sm">
            <span className="text-muted-foreground">Timestamp </span>
            <span className="font-medium">
              {formatSyncTimestamp(server.lastSyncedAt)}
            </span>
          </div>
        </section>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Server data</h2>
          <p className="text-sm text-muted-foreground">
            Latest data imported into the portal for this server.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <Card key={metric.label} size="sm">
                <CardContent className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <CardDescription>{metric.label}</CardDescription>
                    <CardTitle className="mt-1 truncate font-mono text-2xl tabular-nums">
                      {metric.value}
                    </CardTitle>
                  </div>
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Icon className="size-5" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Operations</h2>
          <p className="text-sm text-muted-foreground">
            Run scoped imports, test the API connection, or manage this server.
          </p>
        </div>
        <WsusServerControl
          initialServer={serializedServer}
          userRole={session?.role ?? "viewer"}
          synchronizationContent={synchronizationContent}
        />
      </section>
    </div>
  );
}
