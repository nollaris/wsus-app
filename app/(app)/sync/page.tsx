import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

export default async function SyncCatalogPage() {
  const [settingsList, history, products, classifications] = await Promise.all([
    prisma.synchronizationSetting.findMany({ orderBy: { serverName: "asc" } }),
    prisma.synchronizationHistory.findMany({
      orderBy: { startTime: "desc" },
    }),
    prisma.product.findMany({ orderBy: { title: "asc" } }),
    prisma.classification.findMany({ orderBy: { title: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Synchronization &amp; Catalog
        </h1>
        <p className="text-muted-foreground">
          WSUS synchronization schedule, run history, subscribed products, and classifications.
        </p>
      </div>

      {/* Sync Settings */}
      {settingsList.map((settings) => (
        <Card key={settings.serverName}>
          <CardHeader>
            <CardTitle>Synchronization Settings</CardTitle>
            <CardDescription>
              Server: <span className="font-mono">{settings.serverName}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Auto Sync</div>
              <Badge
                variant="secondary"
                className={
                  settings.synchronizeAutomatically
                    ? "mt-1 bg-emerald-500/15 text-emerald-700"
                    : "mt-1"
                }
              >
                {settings.synchronizeAutomatically ? "Enabled" : "Disabled"}
              </Badge>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Schedule</div>
              <div className="mt-1 font-mono">
                {settings.synchronizationTimeLocal} Local ({settings.synchronizationTimeUtc} UTC)
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Frequency</div>
              <div className="mt-1">
                {settings.syncPerDay}x / day (every {settings.intervalHours}h)
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Last Modified</div>
              <div className="mt-1 font-mono text-xs">
                {settings.lastModifiedBy}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Products & Classifications */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Products ({products.length})</CardTitle>
            <CardDescription>Subscribed update product categories</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Server</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => (
                  <TableRow key={p.categoryId}>
                    <TableCell className="font-medium">{p.title}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {p.serverName || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{p.type}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {p.description}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Classifications ({classifications.length})</CardTitle>
            <CardDescription>Update classification definitions</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Server</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {classifications.map((c) => (
                  <TableRow key={c.classificationId}>
                    <TableCell className="font-medium whitespace-nowrap">
                      {c.title}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {c.serverName || "-"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <span className="line-clamp-2">{c.description}</span>
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
          <CardDescription>Complete log of WSUS catalog sync runs</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-[480px] overflow-y-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Server</TableHead>
                  <TableHead>Start Time</TableHead>
                  <TableHead>End Time</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h) => (
                  <TableRow key={h.synchronizationId}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {h.serverName || "-"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {h.startTime
                        ? h.startTime.toISOString().replace("T", " ").slice(0, 19)
                        : "-"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {h.endTime
                        ? h.endTime.toISOString().replace("T", " ").slice(0, 19)
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {h.startedManually ? "Manual" : "Scheduled"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={
                          h.result === "Succeeded"
                            ? "bg-emerald-500/15 text-emerald-700"
                            : "bg-destructive/15 text-destructive"
                        }
                      >
                        {h.result}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {h.errorText || h.error || "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
