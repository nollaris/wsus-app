import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock, XCircle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { SyncHistoryTable } from "@/components/sync-history-table";
import { WsusServerControl } from "@/components/wsus-server-control";
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 h-8 px-2 text-muted-foreground"
              nativeButton={false}
              render={<Link href="/sync" />}
            >
              <ArrowLeft className="mr-1 size-4" />
              Back to Sync &amp; Servers
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-3xl font-bold tracking-tight">{server.name}</h1>
            <Badge variant={server.enabled ? "secondary" : "outline"}>
              {server.enabled ? "Enabled" : "Disabled"}
            </Badge>
            {server.lastStatus === "Success" ? (
              <Badge
                variant="secondary"
                className="bg-emerald-500/15 text-emerald-700"
              >
                <CheckCircle2 className="mr-1 size-3" />
                Success
              </Badge>
            ) : server.lastStatus === "Failed" ? (
              <Badge variant="destructive">
                <XCircle className="mr-1 size-3" />
                Failed
              </Badge>
            ) : (
              <Badge variant="outline">
                <Clock className="mr-1 size-3" />
                {server.lastStatus ?? "Not synced"}
              </Badge>
            )}
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            {server.baseUrl}
          </p>
        </div>
      </div>

      {/* Server Data Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Managed Clients</CardDescription>
            <CardTitle className="text-2xl font-mono">
              {clientsCount.toLocaleString()}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Patch Inventory</CardDescription>
            <CardTitle className="text-2xl font-mono">
              {patchesCount.toLocaleString()}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Client Patch Records</CardDescription>
            <CardTitle className="text-2xl font-mono">
              {clientPatchesCount.toLocaleString()}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Catalog (Products / Classes)</CardDescription>
            <CardTitle className="text-2xl font-mono">
              {productsCount.toLocaleString()} /{" "}
              {classificationsCount.toLocaleString()}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Interactive Controls */}
      <WsusServerControl
        initialServer={serializedServer}
        userRole={session?.role ?? "viewer"}
      />

      {/* Sync Settings */}
      {syncSetting && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle>Synchronization Schedule</CardTitle>
              <CardDescription className="mt-1">
                WSUS upstream synchronization settings for{" "}
                <span className="font-mono">{server.name}</span>
              </CardDescription>
            </div>
            <Badge
              variant="secondary"
              className={
                syncSetting.synchronizeAutomatically
                  ? "bg-emerald-500/15 text-emerald-700"
                  : ""
              }
            >
              {syncSetting.synchronizeAutomatically
                ? "Auto Sync Enabled"
                : "Auto Sync Disabled"}
            </Badge>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Schedule</div>
              <div className="mt-1 font-mono text-xs sm:text-sm">
                {syncSetting.synchronizationTimeLocal} Local (
                {syncSetting.synchronizationTimeUtc} UTC)
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Frequency</div>
              <div className="mt-1">
                {syncSetting.syncPerDay}x / day (every{" "}
                {syncSetting.intervalHours}h)
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Last Modified</div>
              <div className="mt-1 font-mono text-xs break-all">
                {syncSetting.lastModifiedBy || "-"}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Server Sync History */}
      <Card>
        <CardHeader>
          <CardTitle>
            Synchronization History ({serializedHistory.length})
          </CardTitle>
          <CardDescription>
            Sync runs recorded for {server.name}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SyncHistoryTable rows={serializedHistory} />
        </CardContent>
      </Card>
    </div>
  );
}
