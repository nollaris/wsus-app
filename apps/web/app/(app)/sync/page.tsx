import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { SyncHistoryTable } from "@/components/sync-history-table";
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

export const instant = false;

export const metadata: Metadata = {
  title: "Sync & Catalog",
};

function groupByKey<T extends { serverName: string }>(
  items: T[],
  getKey: (item: T) => string
) {
  const map = new Map<string, { item: T; servers: string[] }>();

  for (const item of items) {
    const key = getKey(item);
    const server = item.serverName.trim();
    const existing = map.get(key);
    if (existing) {
      if (server && !existing.servers.includes(server)) {
        existing.servers.push(server);
      }
    } else {
      map.set(key, {
        item,
        servers: server ? [server] : [],
      });
    }
  }

  return Array.from(map.entries()).map(([key, value]) => ({
    key,
    item: value.item,
    servers: value.servers.sort(),
  }));
}

function ServerBadges({ servers }: { servers: string[] }) {
  if (servers.length === 0) {
    return <span className="font-mono text-xs text-muted-foreground">-</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {servers.map((server) => (
        <Badge
          key={server}
          variant="secondary"
          className="font-mono text-xs font-normal"
        >
          {server}
        </Badge>
      ))}
    </div>
  );
}

export default async function SyncCatalogPage() {
  const [settingsList, history, products, classifications] = await Promise.all([
    prisma.synchronizationSetting.findMany({ orderBy: { serverName: "asc" } }),
    prisma.synchronizationHistory.findMany({
      orderBy: { startTime: "desc" },
    }),
    prisma.product.findMany({ orderBy: { title: "asc" } }),
    prisma.classification.findMany({ orderBy: { title: "asc" } }),
  ]);

  const groupedProducts = groupByKey(products, (p) => p.categoryId);
  const groupedClassifications = groupByKey(
    classifications,
    (c) => c.classificationId
  );

  const serializedHistory = history.map((h) => ({
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
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Synchronization &amp; Catalog
        </h1>
        <p className="text-muted-foreground">
          WSUS synchronization schedule, run history, subscribed products, and
          classifications.
        </p>
      </div>

      {/* Sync Settings */}
      {settingsList.length > 0 && (
        <div
          className={
            settingsList.length > 1
              ? "grid gap-4 lg:grid-cols-2"
              : "grid gap-4"
          }
        >
          {settingsList.map((settings) => (
            <Card key={settings.serverName}>
              <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                <div>
                  <CardTitle>Synchronization Settings</CardTitle>
                  <CardDescription className="mt-1">
                    Server:{" "}
                    <span className="font-mono">{settings.serverName}</span>
                  </CardDescription>
                </div>
                <Badge
                  variant="secondary"
                  className={
                    settings.synchronizeAutomatically
                      ? "bg-emerald-500/15 text-emerald-700"
                      : ""
                  }
                >
                  {settings.synchronizeAutomatically
                    ? "Auto Sync Enabled"
                    : "Auto Sync Disabled"}
                </Badge>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Schedule</div>
                  <div className="mt-1 font-mono text-xs sm:text-sm">
                    {settings.synchronizationTimeLocal} Local (
                    {settings.synchronizationTimeUtc} UTC)
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Frequency</div>
                  <div className="mt-1">
                    {settings.syncPerDay}x / day (every {settings.intervalHours}h)
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">
                    Last Modified
                  </div>
                  <div className="mt-1 font-mono text-xs break-all">
                    {settings.lastModifiedBy || "-"}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Products & Classifications (grouped by item with server badges) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Products ({groupedProducts.length})</CardTitle>
            <CardDescription>
              Subscribed update products grouped with their WSUS servers
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Servers</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedProducts.map(({ key, item: p, servers }) => (
                  <TableRow key={key}>
                    <TableCell>
                      <div className="font-medium">{p.title}</div>
                      {p.description && p.description !== p.title && (
                        <div className="text-xs text-muted-foreground line-clamp-2">
                          {p.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      <Badge variant="outline">{p.type}</Badge>
                    </TableCell>
                    <TableCell className="align-top">
                      <ServerBadges servers={servers} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Classifications ({groupedClassifications.length})
            </CardTitle>
            <CardDescription>
              Update classification definitions grouped with their WSUS servers
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Classification</TableHead>
                  <TableHead>Servers</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedClassifications.map(({ key, item: c, servers }) => (
                  <TableRow key={key}>
                    <TableCell>
                      <div className="font-medium whitespace-nowrap">
                        {c.title}
                      </div>
                      {c.description && (
                        <div className="text-xs text-muted-foreground line-clamp-2">
                          {c.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      <ServerBadges servers={servers} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Sync History */}
      <Card>
        <CardHeader>
          <CardTitle>Synchronization History ({history.length})</CardTitle>
          <CardDescription>
            Complete log of WSUS catalog sync runs
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SyncHistoryTable rows={serializedHistory} />
        </CardContent>
      </Card>
    </div>
  );
}
