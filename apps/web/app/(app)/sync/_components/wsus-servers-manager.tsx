"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { canManageServers, canTriggerSync } from "@/lib/rbac";
import type { SyncScope } from "@/lib/wsus-api-sync";
import {
  ArrowUpRight,
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
  CardFooter,
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

export interface WsusServerItem {
  id: number;
  name: string;
  baseUrl: string;
  enabled: boolean;
  lastSyncedAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
}

function formatSyncError(error: string | null) {
  if (!error) return null;
  if (/timed?\s*out|timeout/i.test(error)) {
    if (/not an API-key rejection/i.test(error)) return error;
    return `The WSUS API request timed out (${error}). This is not an API-key rejection. Check WSUS/network responsiveness or adjust the per-request timeout.`;
  }
  return error;
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
  const allowSync = canTriggerSync(userRole);
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

  const [startingAll, setStartingAll] = React.useState(false);
  const [startingServerIds, setStartingServerIds] = React.useState<number[]>(
    [],
  );
  const [feedback, setFeedback] = React.useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const enabledServers = servers.filter((s) => s.enabled);
  const anySyncing = servers.some((s) => s.lastStatus === "Syncing");
  const allEnabledSyncing =
    enabledServers.length > 0 &&
    enabledServers.every((s) => s.lastStatus === "Syncing");

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

  async function handleSync(
    serverId: number | "all",
    scope: SyncScope = "all",
  ) {
    if (serverId === "all") {
      setStartingAll(true);
    } else {
      setStartingServerIds((prev) =>
        prev.includes(serverId) ? prev : [...prev, serverId],
      );
    }
    setFeedback(null);
    try {
      const res = await fetch("/api/wsus-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          serverId === "all" ? { scope } : { serverId, scope },
        ),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? "Failed to start synchronization");
      }

      const startedIds: number[] = Array.isArray(data.startedIds)
        ? data.startedIds
        : [];
      const alreadyRunningIds: number[] = Array.isArray(data.alreadyRunningIds)
        ? data.alreadyRunningIds
        : [];
      const scopeLabel = scope === "all" ? "Full sync" : `${scope} sync`;
      const message =
        startedIds.length === 0 && alreadyRunningIds.length > 0
          ? serverId === "all"
            ? "All enabled servers are already syncing."
            : "This server is already syncing."
          : serverId === "all"
            ? `${scopeLabel} started for ${startedIds.length} server${startedIds.length === 1 ? "" : "s"}${alreadyRunningIds.length ? `; ${alreadyRunningIds.length} already syncing` : ""}.`
            : `${scopeLabel} started.`;
      setFeedback({
        type: "success",
        message: `${message} Status will update automatically.`,
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

  const syncingCount = servers.filter(
    (server) => server.lastStatus === "Syncing",
  ).length;
  const failedCount = servers.filter(
    (server) => server.lastStatus === "Failed",
  ).length;

  return (
    <div className="space-y-5">
      {feedback && (
        <Alert
          variant={feedback.type === "error" ? "destructive" : "default"}
          role={feedback.type === "error" ? "alert" : "status"}
        >
          <AlertDescription>{feedback.message}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Configured servers", value: servers.length, icon: Server },
          {
            label: "Enabled",
            value: enabledServers.length,
            icon: CheckCircle2,
          },
          { label: "Syncing", value: syncingCount, icon: RefreshCw },
          { label: "Needs attention", value: failedCount, icon: XCircle },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} size="sm">
              <CardContent className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">
                    {stat.value}
                  </p>
                </div>
                <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="size-5" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Server className="size-5" />
              WSUS servers
            </CardTitle>
            <CardDescription className="mt-1">
              Sync status, endpoint, and last update for each connected server.
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
                Sync all enabled
              </Button>
            )}

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

        <CardContent className="pb-4">
          {servers.length === 0 ? (
            <div className="rounded-xl border border-dashed px-6 py-12 text-center">
              <Server className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 font-medium">No WSUS servers connected</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add a WSUS REST API endpoint to start importing server data.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {servers.map((srv) => {
                const isRowSyncing =
                  srv.lastStatus === "Syncing" ||
                  startingServerIds.includes(srv.id);
                const syncError =
                  srv.lastStatus === "Failed"
                    ? formatSyncError(srv.lastError)
                    : null;

                return (
                  <Card key={srv.id} size="sm" className="min-w-0">
                    <CardHeader className="gap-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <CardTitle className="truncate">{srv.name}</CardTitle>
                          <CardDescription className="mt-1 break-all font-mono text-xs">
                            {srv.baseUrl}
                          </CardDescription>
                        </div>
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
                                ? "border-sky-500/30 bg-sky-500/10 text-sky-700"
                                : srv.lastStatus === "Success"
                                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
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
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                        <span className="text-muted-foreground">Last sync</span>
                        <span className="text-right font-medium">
                          {formatTimestamp(srv.lastSyncedAt)}
                        </span>
                      </div>
                      {syncError && (
                        <Alert variant="destructive">
                          <XCircle className="size-4" />
                          <AlertDescription className="wrap-break-word">
                            {syncError}
                          </AlertDescription>
                        </Alert>
                      )}
                    </CardContent>

                    <CardFooter className="flex flex-wrap justify-end gap-2">
                      <Button
                        nativeButton={false}
                        render={<Link href={`/sync/${srv.id}`} />}
                        variant="outline"
                        size="sm"
                      >
                        Manage
                        <ArrowUpRight className="ml-1 size-4" />
                      </Button>
                      {allowSync && (
                        <Button
                          size="sm"
                          disabled={!srv.enabled || isRowSyncing}
                          onClick={() => handleSync(srv.id)}
                        >
                          {isRowSyncing ? (
                            <Loader2 className="mr-1.5 size-4 animate-spin" />
                          ) : (
                            <RefreshCw className="mr-1.5 size-4" />
                          )}
                          {isRowSyncing ? "Syncing" : "Sync now"}
                        </Button>
                      )}
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
