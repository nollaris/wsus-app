import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PatchClientsTable } from "@/components/patch-clients-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const instant = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const updateId = decodeURIComponent(id);
  const patch = await prisma.patchInventory.findFirst({
    where: { updateId },
    orderBy: [{ isLatestRevision: "desc" }, { revisionNumber: "desc" }],
    select: { title: true, kbArticle: true },
  });
  if (!patch) {
    return { title: "Patch Not Found" };
  }
  return {
    title: patch.kbArticle ? `KB${patch.kbArticle} - ${patch.title}` : patch.title,
  };
}

const SEVERITY_BADGE: Record<string, string> = {
  Critical: "bg-destructive/15 text-destructive",
  Important: "bg-orange-500/15 text-orange-700",
  Moderate: "bg-amber-500/15 text-amber-700",
  Unspecified: "bg-muted text-muted-foreground",
};

export default async function PatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const updateId = decodeURIComponent(id);

  const [patchRevisions, clientStatuses] = await Promise.all([
    prisma.patchInventory.findMany({
      where: { updateId },
      orderBy: [{ isLatestRevision: "desc" }, { revisionNumber: "desc" }, { serverName: "asc" }],
    }),
    prisma.clientPatchStatus.findMany({
      where: { updateId },
      orderBy: [{ installationState: "asc" }, { computerName: "asc" }],
      select: {
        id: true,
        serverName: true,
        computerTargetId: true,
        computerName: true,
        ipAddress: true,
        installationState: true,
        approvalAction: true,
      },
    }),
  ]);

  const patch = patchRevisions[0];
  if (!patch) {
    notFound();
  }

  const serverEntries = Array.from(
    patchRevisions
      .reduce((map, row) => {
        if (!map.has(row.serverName)) {
          map.set(row.serverName, row);
        }
        return map;
      }, new Map<string, (typeof patchRevisions)[number]>())
      .values()
  ).sort((a, b) => a.serverName.localeCompare(b.serverName));
  const serverNames = serverEntries.map((s) => s.serverName).filter(Boolean);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/patches"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Patches
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">{patch.title}</h1>
            <p className="text-sm text-muted-foreground">
              {patch.kbArticle ? (
                <span className="font-mono">KB{patch.kbArticle} &middot; </span>
              ) : null}
              {patch.classification} &middot;{" "}
              <span className="font-mono text-xs">{patch.updateId}</span>
              {serverNames.length > 0 ? (
                <span className="font-mono text-xs">
                  {" "}
                  &middot; {serverNames.length === 1 ? "Server" : "Servers"}: {serverNames.join(", ")}
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="secondary"
              className={SEVERITY_BADGE[patch.msrcSeverity] || ""}
            >
              {patch.msrcSeverity}
            </Badge>
            {patch.isApproved && (
              <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-700">
                Approved
              </Badge>
            )}
            {patch.isDeclined && (
              <Badge variant="outline" className="text-muted-foreground">
                Declined
              </Badge>
            )}
            {patch.isSuperseded && <Badge variant="outline">Superseded</Badge>}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Products
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm font-medium">
            {patch.products || "-"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Type &amp; Revision
            </CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-sm">
            {patch.updateType || "-"} &middot; Rev {patch.revisionNumber}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Arrival Date
            </CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-sm">
            {patch.arrivalDate
              ? patch.arrivalDate.toISOString().replace("T", " ").slice(0, 19)
              : "-"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Creation Date
            </CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-sm">
            {patch.creationDate
              ? patch.creationDate.toISOString().replace("T", " ").slice(0, 19)
              : "-"}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Description</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {patch.description || "No description available."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            WSUS Servers ({serverEntries.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Server</TableHead>
                  <TableHead>Revision</TableHead>
                  <TableHead>Arrival Date</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {serverEntries.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="h-16 text-center text-muted-foreground"
                    >
                      No server records for this patch.
                    </TableCell>
                  </TableRow>
                ) : (
                  serverEntries.map((s) => (
                    <TableRow key={`${s.serverName}-${s.revisionNumber}`}>
                      <TableCell className="font-mono text-xs font-medium">
                        {s.serverName || "-"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        Rev {s.revisionNumber}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {s.arrivalDate
                          ? s.arrivalDate.toISOString().replace("T", " ").slice(0, 19)
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-1">
                          {s.isApproved && (
                            <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-700">
                              Approved
                            </Badge>
                          )}
                          {s.isDeclined && (
                            <Badge variant="outline" className="text-muted-foreground">
                              Declined
                            </Badge>
                          )}
                          {s.isSuperseded && (
                            <Badge variant="outline" className="text-xs">
                              Superseded
                            </Badge>
                          )}
                          {!s.isApproved && !s.isDeclined && !s.isSuperseded && (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Client Installation Status ({clientStatuses.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PatchClientsTable clientStatuses={clientStatuses} />
        </CardContent>
      </Card>
    </div>
  );
}
