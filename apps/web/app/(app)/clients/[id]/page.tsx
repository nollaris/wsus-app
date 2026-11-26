import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatBangkokTimestamp } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/ui/card";
import { Badge } from "@workspace/ui/components/ui/badge";
import { ClientComplianceCharts } from "./_components/client-compliance-charts";
import { ClientPatchesTable } from "./_components/client-patches-table";
import { resolveClientOsVersion, splitTargetGroups } from "../_lib/wsus-compliance";

export const instant = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const client = await prisma.clientStatus.findFirst({
    where: { computerTargetId: id },
    select: { computerName: true },
  });
  return {
    title: client ? client.computerName : "Client Not Found",
  };
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [client, patches] = await Promise.all([
    prisma.clientStatus.findFirst({ where: { computerTargetId: id } }),
    prisma.clientPatchStatus.findMany({
      where: { computerTargetId: id },
      orderBy: [{ installationState: "asc" }, { updateTitle: "asc" }],
      select: {
        id: true,
        updateTitle: true,
        kbArticle: true,
        classification: true,
        installationState: true,
        approvalAction: true,
        errorCode: true,
        errorMessage: true,
      },
    }),
  ]);

  if (!client) {
    notFound();
  }

  const resolvedOs = resolveClientOsVersion({
    osDescription: client.osDescription,
    osVersion: client.osVersion,
    patches,
  });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/clients"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Client Status
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{client.computerName}</h1>
        <p className="text-sm text-muted-foreground font-mono">
          {client.ipAddress} &middot; {resolvedOs}
          {client.serverName ? ` · Server: ${client.serverName}` : ""}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Target Groups
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const targetGroups = splitTargetGroups(client.assignedTargetGroups);
              if (targetGroups.length === 0) {
                return <span className="text-sm text-muted-foreground">-</span>;
              }
              return (
                <div className="flex flex-wrap gap-1.5">
                  {targetGroups.map((group) => (
                    <Badge key={group} variant="outline">
                      {group}
                    </Badge>
                  ))}
                </div>
              );
            })()}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Client Version
            </CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-sm">{client.clientVersion}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Last Sync Time
            </CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-sm">
            {formatBangkokTimestamp(client.lastSyncTime)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Last Status Report
            </CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-sm">
            {formatBangkokTimestamp(client.lastReportedStatusTime)}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Additional Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Computer make</dt>
              <dd className="mt-0.5 font-medium">{client.make || "-"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Computer model</dt>
              <dd className="mt-0.5 font-medium">{client.model || "-"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Processor</dt>
              <dd className="mt-0.5 font-mono">{client.processorArchitecture || "-"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">BIOS version</dt>
              <dd className="mt-0.5 font-mono">{client.biosVersion || "-"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Firmware version</dt>
              <dd className="mt-0.5 font-mono">{client.firmwareVersion || "-"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Mobile operator</dt>
              <dd className="mt-0.5">{client.mobileOperator || "-"}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <ClientComplianceCharts
        patches={patches}
        summaryCounts={{
          installedCount: client.installedCount,
          notApplicableCount: client.notApplicableCount,
          neededCount: client.neededCount,
          failedCount: client.failedCount,
          pendingRebootCount: client.pendingRebootCount,
          unknownCount: client.unknownCount,
        }}
      />

      <ClientPatchesTable patches={patches} />
    </div>
  );
}
