"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { canManageServers } from "@/lib/rbac";
import {
  CheckCircle2,
  Clock3,
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

function formatTimestamp(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Bangkok",
  });
}

export function WsusServersManager({
  initialServers,
  userRole = "viewer",
}: {
  initialServers: WsusServerItem[];
  userRole?: string;
}) {
  const allowManage = canManageServers(userRole);
  const router = useRouter();
  const initialServersKey = JSON.stringify(initialServers);
  const [serverSnapshot, setServerSnapshot] = React.useState<{
    key: string;
    servers: WsusServerItem[];
  } | null>(null);
  const servers =
    serverSnapshot?.key === initialServersKey
      ? serverSnapshot.servers
      : initialServers;
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const [name, setName] = React.useState("");
  const [baseUrl, setBaseUrl] = React.useState(
    "http://wsus-hq.corp.local:8530/wsus-api/api/v1",
  );
  const [apiKey, setApiKey] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const [feedback, setFeedback] = React.useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const enabledServers = servers.filter((s) => s.enabled);
  const anySyncing = servers.some((s) => s.lastStatus === "Syncing");

  const fetchLatestServers = React.useCallback(async () => {
    const res = await fetch("/api/wsus-servers", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      const next: WsusServerItem[] = data.servers ?? [];
      setServerSnapshot({ key: initialServersKey, servers: next });
      return next;
    }
    return null;
  }, [initialServersKey]);

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

  const syncingCount = servers.filter(
    (server) => server.lastStatus === "Syncing",
  ).length;
  const healthyCount = servers.filter(
    (server) => server.enabled && server.lastStatus === "Success",
  ).length;
  const failedCount = servers.filter(
    (server) => server.lastStatus === "Failed",
  ).length;

  const stats = [
    {
      label: "Configured servers",
      value: servers.length,
      description: `${enabledServers.length} enabled for sync`,
      icon: Server,
      iconClass: "bg-muted text-muted-foreground",
    },
    {
      label: "Healthy",
      value: healthyCount,
      description: "Last synchronization succeeded",
      icon: CheckCircle2,
      iconClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    },
    {
      label: "Syncing",
      value: syncingCount,
      description: syncingCount > 0 ? "Active sync in progress" : "Idle",
      icon: RefreshCw,
      iconClass: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
    },
    {
      label: "Needs attention",
      value: failedCount,
      description: failedCount > 0 ? "Failed last synchronization" : "No sync errors",
      icon: XCircle,
      iconClass:
        failedCount > 0
          ? "bg-destructive/10 text-destructive"
          : "bg-muted text-muted-foreground",
    },
  ];

  return (
    <div className="space-y-6">
      {feedback && (
        <Alert
          variant={feedback.type === "error" ? "destructive" : "default"}
          role={feedback.type === "error" ? "alert" : "status"}
        >
          <AlertDescription>{feedback.message}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.label}
                </CardTitle>
                <div
                  className={`flex size-8 items-center justify-center rounded-lg ${stat.iconClass}`}
                >
                  <Icon className="size-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums">
                  {stat.value}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="flex items-center gap-2">
                <Server className="size-5" />
                WSUS servers
              </CardTitle>
              <Badge variant="secondary" className="font-mono tabular-nums">
                {servers.length}
              </Badge>
            </div>
            <CardDescription className="mt-1">
              Sync status, API endpoint, and last update for each connected server.
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {allowManage && (
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger
                  render={
                    <Button size="sm">
                      <Plus className="mr-2 size-4" />
                      Add server
                    </Button>
                  }
                />
                <DialogContent>
                  <form onSubmit={handleAddServer}>
                    <DialogHeader>
                      <DialogTitle>Add WSUS server</DialogTitle>
                      <DialogDescription>
                        Connect the WSUS REST API installed on the target host.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label htmlFor="wsus-name">Server name</Label>
                        <Input
                          id="wsus-name"
                          placeholder="WSUS-HQ"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          required
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="wsus-url">API base URL</Label>
                        <Input
                          id="wsus-url"
                          placeholder="http://wsus-host:8530/wsus-api/api/v1"
                          value={baseUrl}
                          onChange={(e) => setBaseUrl(e.target.value)}
                          required
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="wsus-key">API key (X-Api-Key)</Label>
                        <Input
                          id="wsus-key"
                          type="password"
                          autoComplete="new-password"
                          placeholder="Enter the WSUS API key"
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          required
                        />
                        <p className="text-xs text-muted-foreground">
                          Saved in the portal database and never shown again.
                          You only need to enter it when adding a server or
                          replacing its key.
                        </p>
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
                        Save server
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {servers.length === 0 ? (
            <div className="rounded-xl border border-dashed px-6 py-12 text-center">
              <Server className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 font-medium">No WSUS servers connected</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add a WSUS REST API endpoint to start importing server data.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table className="min-w-[780px]">
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Server</TableHead>
                    <TableHead>API Endpoint</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Sync · ICT</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {servers.map((srv) => (
                    <TableRow key={srv.id}>
                      <TableCell>
                        <Link
                          href={`/sync/${srv.id}`}
                          className="font-medium hover:underline"
                        >
                          {srv.name}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        <span className="break-all">{srv.baseUrl}</span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            !srv.enabled
                              ? "outline"
                              : srv.lastStatus === "Failed"
                                ? "destructive"
                                : srv.lastStatus === "Success"
                                  ? "secondary"
                                  : "outline"
                          }
                          className={
                            !srv.enabled
                              ? ""
                              : srv.lastStatus === "Syncing"
                                ? "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400"
                                : srv.lastStatus === "Success"
                                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                  : ""
                          }
                        >
                          {!srv.enabled ? (
                            <Server />
                          ) : srv.lastStatus === "Syncing" ? (
                            <Loader2 className="animate-spin" />
                          ) : srv.lastStatus === "Success" ? (
                            <CheckCircle2 />
                          ) : srv.lastStatus === "Failed" ? (
                            <XCircle />
                          ) : (
                            <Clock3 />
                          )}
                          {!srv.enabled
                            ? "Disabled"
                            : srv.lastStatus === "Syncing"
                              ? "Syncing"
                              : srv.lastStatus === "Success"
                                ? "Healthy"
                                : srv.lastStatus === "Failed"
                                  ? "Failed"
                                  : (srv.lastStatus ?? "Not synced")}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs whitespace-nowrap text-muted-foreground">
                        {formatTimestamp(srv.lastSyncedAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
