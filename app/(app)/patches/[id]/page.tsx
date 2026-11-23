import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Monitor } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const instant = false;

const SEVERITY_BADGE: Record<string, string> = {
  Critical: "bg-destructive/15 text-destructive",
  Important: "bg-orange-500/15 text-orange-700",
  Moderate: "bg-amber-500/15 text-amber-700",
  Unspecified: "bg-muted text-muted-foreground",
};

const STATE_BADGE: Record<string, string> = {
  Installed: "bg-emerald-500/15 text-emerald-700",
  NotInstalled: "bg-amber-500/15 text-amber-700",
  Failed: "bg-destructive/15 text-destructive",
  Downloaded: "bg-sky-500/15 text-sky-700",
};

export default async function PatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const updateId = decodeURIComponent(id);

  const [patch, clientStatuses] = await Promise.all([
    prisma.patchInventory.findFirst({
      where: { updateId },
      orderBy: [{ isLatestRevision: "desc" }, { revisionNumber: "desc" }],
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

  if (!patch) {
    notFound();
  }

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
              {patch.serverName ? (
                <span className="font-mono text-xs"> &middot; Server: {patch.serverName}</span>
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
            Client Installation Status ({clientStatuses.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Computer Name</TableHead>
                  <TableHead>Server</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Approval</TableHead>
                  <TableHead className="text-right">State</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientStatuses.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No client installation records for this patch.
                    </TableCell>
                  </TableRow>
                ) : (
                  clientStatuses.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/clients/${c.computerTargetId}`}
                          className="inline-flex items-center gap-2 text-primary hover:underline"
                        >
                          <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
                          {c.computerName}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {c.serverName || "-"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{c.ipAddress}</TableCell>
                      <TableCell className="text-xs">{c.approvalAction}</TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant="secondary"
                          className={STATE_BADGE[c.installationState] || ""}
                        >
                          {c.installationState}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
