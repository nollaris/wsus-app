import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClientComplianceCharts } from "@/components/client-compliance-charts";
import { ClientPatchesTable } from "@/components/client-patches-table";

export const instant = false;

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [client, patches] = await Promise.all([
    prisma.clientStatus.findUnique({ where: { computerTargetId: id } }),
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
      },
    }),
  ]);

  if (!client) {
    notFound();
  }

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
          {client.ipAddress} &middot; {client.osDescription}
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
            <Badge variant="outline">{client.assignedTargetGroups}</Badge>
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
            {client.lastSyncTime
              ? client.lastSyncTime.toISOString().replace("T", " ").slice(0, 19)
              : "-"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Last Status Report
            </CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-sm">
            {client.lastReportedStatusTime
              ? client.lastReportedStatusTime
                  .toISOString()
                  .replace("T", " ")
                  .slice(0, 19)
              : "-"}
          </CardContent>
        </Card>
      </div>

      <ClientComplianceCharts patches={patches} />

      <ClientPatchesTable patches={patches} />
    </div>
  );
}
