"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { canManageServers, canTriggerSync } from "@/lib/rbac";
import type { SyncScope } from "@/lib/wsus-api-sync";
import {
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  Server,
  XCircle,
} from "lucide-react";
import { Alert, AlertDescription } from "@workspace/ui/components/ui/alert";
import { Badge } from "@workspace/ui/components/ui/badge";
import { Button } from "@workspace/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/ui/dialog";
import { Input } from "@workspace/ui/components/ui/input";
import { Label } from "@workspace/ui/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/ui/table";

export interface WsusServerItem {
  id: number;
  name: string;
  baseUrl: string;
  enabled: boolean;
  lastSyncedAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
}

export function WsusServersManager({
  initialServers,
  userRole = "viewer",
}: {
  initialServers: WsusServerItem[];
  userRole?: string;
}) {
  const allowManage = canManageServers(userRole);
  const allowSync = canTriggerSync(userRole);
  const router = useRouter();
  const [servers, setServers] = React.useState<WsusServerItem[]>(initialServers);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const [name, setName] = React.useState("");
  const [baseUrl, setBaseUrl] = React.useState(
    "http://wsus-hq.corp.local:8530/wsus-api/api/v1"
  );
  const [apiKey, setApiKey] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const [startingAll, setStartingAll] = React.useState(false);
  const [startingServerIds, setStartingServerIds] = React.useState<number[]>([]);
  const [feedback, setFeedback] = React.useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const enabledServers = servers.filter((s) => s.enabled);
  const anySyncing = servers.some((s) => s.lastStatus === "Syncing");
  const allEnabledSyncing =
    enabledServers.length > 0 &&
    enabledServers.every((s) => s.lastStatus === "Syncing");

  React.useEffect(() => {
    setServers(initialServers);
  }, [initialServers]);

  const fetchLatestServers = React.useCallback(async () => {
    const res = await fetch("/api/wsus-servers", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      const next: WsusServerItem[] = data.servers ?? [];
      setServers(next);
      return next;
    }
    return null;
  }, []);

  React.useEffect(() => {
    if (!anySyncing) return;

    const timer = setInterval(async () => {
      const next = await fetchLatestServers();
      if (next && !next.some((s) => s.lastStatus === "Syncing")) {
        router.refresh();
      }
    }, 2000);

    return () => clearInterval(timer);
  }, [anySyncing, fetchLatestServers, router]);

  async function refreshServers() {
    await fetchLatestServers();
    router.refresh();
  }

  async function handleAddServer(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/wsus-servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, baseUrl, apiKey, enabled: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to add WSUS server");
      }
      setName("");
      setApiKey("");
      setDialogOpen(false);
      setFeedback({
        type: "success",
        message: `Added WSUS server "${data.server.name}".`,
      });
      await refreshServers();
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to add server",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSync(
    serverId: number | "all",
    scope: SyncScope = "all"
  ) {
    if (serverId === "all") {
      setStartingAll(true);
    } else {
      setStartingServerIds((prev) =>
        prev.includes(serverId) ? prev : [...prev, serverId]
      );
    }
    setFeedback(null);
    try {
      const res = await fetch("/api/wsus-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          serverId === "all" ? { scope } : { serverId, scope }
        ),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? "Failed to start synchronization");
      }

      const scopeLabel =
        scope === "all" ? "Full synchronization" : `Sync (${scope})`;
      setFeedback({
        type: "success",
        message: `${scopeLabel} started in background. Status will update automatically.`,
      });
      await fetchLatestServers();
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Sync failed",
      });
    } finally {
      if (serverId === "all") {
        setStartingAll(false);
      } else {
        setStartingServerIds((prev) => prev.filter((id) => id !== serverId));
      }
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Server className="size-5" />
            WSUS Servers (API Sync)
          </CardTitle>
          <CardDescription className="mt-1">
            Add each WSUS server endpoint (Port 8530{" "}
            <span className="font-mono">/wsus-api/api/v1</span>) and pull live
            data into the portal.
          </CardDescription>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {allowSync && (
            <Button
              variant="outline"
              size="sm"
              disabled={
                startingAll ||
                allEnabledSyncing ||
                enabledServers.length === 0
              }
              onClick={() => handleSync("all")}
            >
              {startingAll || allEnabledSyncing ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 size-4" />
              )}
              Sync All Enabled
            </Button>
          )}

          {allowManage && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger
              render={
                <Button size="sm">
                  <Plus className="mr-2 size-4" />
                  Add Server
                </Button>
              }
            />
            <DialogContent>
              <form onSubmit={handleAddServer}>
                <DialogHeader>
                  <DialogTitle>Add WSUS Server</DialogTitle>
                  <DialogDescription>
                    Enter the local WSUS REST API endpoint installed on the
                    target WSUS host.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="wsus-name">Server Name</Label>
                    <Input
                      id="wsus-name"
                      placeholder="WSUS-HQ"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="wsus-url">API Base URL</Label>
                    <Input
                      id="wsus-url"
                      placeholder="http://wsus-hq.corp.local:8530/wsus-api/api/v1"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="wsus-key">API Key (X-Api-Key)</Label>
                    <Input
                      id="wsus-key"
                      type="password"
                      placeholder="wsus-readonly-api-key..."
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting && (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    )}
                    Save Server
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {feedback && (
          <Alert
            variant={feedback.type === "error" ? "destructive" : "default"}
          >
            <AlertDescription>{feedback.message}</AlertDescription>
          </Alert>
        )}

        {servers.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            No WSUS servers added yet. Click <strong>Add Server</strong> to
            connect a WSUS host and sync data via API.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Server</TableHead>
                  <TableHead>API Base URL</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Synced</TableHead>
                  {allowSync && (
                    <TableHead className="text-right">Action</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {servers.map((srv) => {
                  const isRowSyncing =
                    srv.lastStatus === "Syncing" ||
                    startingServerIds.includes(srv.id);
                  return (
                  <TableRow key={srv.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/sync/${srv.id}`}
                          className="hover:underline text-primary"
                        >
                          {srv.name}
                        </Link>
                        {!srv.enabled && (
                          <Badge variant="outline" className="text-xs">
                            Disabled
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {srv.baseUrl}
                    </TableCell>
                    <TableCell>
                      {srv.lastStatus === "Syncing" ? (
                        <Badge
                          variant="secondary"
                          className="bg-sky-500/15 text-sky-700"
                        >
                          <Loader2 className="mr-1 size-3 animate-spin" />
                          Syncing...
                        </Badge>
                      ) : srv.lastStatus === "Success" ? (
                        <Badge
                          variant="secondary"
                          className="bg-emerald-500/15 text-emerald-700"
                        >
                          <CheckCircle2 className="mr-1 size-3" />
                          Success
                        </Badge>
                      ) : srv.lastStatus === "Failed" ? (
                        <Badge
                          variant="destructive"
                          title={srv.lastError ?? undefined}
                        >
                          <XCircle className="mr-1 size-3" />
                          Failed
                        </Badge>
                      ) : (
                        <Badge variant="outline">Not synced</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {srv.lastSyncedAt
                        ? new Date(srv.lastSyncedAt).toLocaleString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                            hour12: false,
                            timeZone: "Asia/Bangkok",
                          })
                        : "-"}
                    </TableCell>
                    {allowSync && (
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!srv.enabled || isRowSyncing}
                          onClick={() => handleSync(srv.id)}
                        >
                          {isRowSyncing ? (
                            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="mr-1.5 size-3.5" />
                          )}
                          Sync
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
