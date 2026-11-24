import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { WsusServersManager } from "./_components/wsus-servers-manager";
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
  const [session, wsusServers, products, classifications] =
    await Promise.all([
      getSession(),
      prisma.wsusServer.findMany({ orderBy: { name: "asc" } }),
      prisma.product.findMany({ orderBy: { title: "asc" } }),
      prisma.classification.findMany({ orderBy: { title: "asc" } }),
    ]);

  let resolvedProducts = products;
  let resolvedClassifications = classifications;

  if (resolvedProducts.length === 0 || resolvedClassifications.length === 0) {
    const patchRows = await prisma.patchInventory.findMany({
      select: { serverName: true, products: true, classification: true },
      distinct: ["serverName", "products", "classification"],
    });

    if (resolvedProducts.length === 0) {
      const derivedProducts = new Map<
        string,
        { serverName: string; categoryId: string; title: string; type: string; description: string; arrivalDate: Date | null }
      >();
      for (const row of patchRows) {
        if (!row.products) continue;
        for (const raw of row.products.split(",")) {
          const title = raw.trim();
          if (!title) continue;
          const categoryId = title.toLowerCase();
          const mapKey = `${row.serverName}::${categoryId}`;
          if (!derivedProducts.has(mapKey)) {
            derivedProducts.set(mapKey, {
              serverName: row.serverName,
              categoryId,
              title,
              type: "Product",
              description: "",
              arrivalDate: null,
            });
          }
        }
      }
      resolvedProducts = Array.from(derivedProducts.values()).sort((a, b) =>
        a.title.localeCompare(b.title)
      );
    }

    if (resolvedClassifications.length === 0) {
      const derivedClassifications = new Map<
        string,
        { serverName: string; classificationId: string; title: string; description: string; arrivalDate: Date | null; releaseNotes: string | null }
      >();
      for (const row of patchRows) {
        const title = row.classification.trim();
        if (!title) continue;
        const classificationId = title.toLowerCase();
        const mapKey = `${row.serverName}::${classificationId}`;
        if (!derivedClassifications.has(mapKey)) {
          derivedClassifications.set(mapKey, {
            serverName: row.serverName,
            classificationId,
            title,
            description: "",
            arrivalDate: null,
            releaseNotes: null,
          });
        }
      }
      resolvedClassifications = Array.from(derivedClassifications.values()).sort((a, b) =>
        a.title.localeCompare(b.title)
      );
    }
  }

  const serializedServers = wsusServers.map((s) => ({
    id: s.id,
    name: s.name,
    baseUrl: s.baseUrl,
    enabled: s.enabled,
    lastSyncedAt: s.lastSyncedAt ? s.lastSyncedAt.toISOString() : null,
    lastStatus: s.lastStatus,
    lastError: s.lastError,
  }));

  const groupedProducts = groupByKey(resolvedProducts, (p) => p.categoryId);
  const groupedClassifications = groupByKey(
    resolvedClassifications,
    (c) => c.classificationId
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Synchronization &amp; Servers
        </h1>
        <p className="text-muted-foreground">
          Manage WSUS server API endpoints, pull live sync data, and review the
          update catalog.
        </p>
      </div>

      <WsusServersManager
        initialServers={serializedServers}
        userRole={session?.role ?? "viewer"}
      />

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
    </div>
  );
}
