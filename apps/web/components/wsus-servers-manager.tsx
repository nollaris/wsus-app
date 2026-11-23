"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { canManageServers, canTriggerSync } from "@/lib/rbac";
import {
  Activity,
  CheckCircle2,
  KeyRound,
  Loader2,
  Plus,
  Power,
  RefreshCw,
  Server,
  Trash2,
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

  const [editingApiKeyServer, setEditingApiKeyServer] =
    React.useState<WsusServerItem | null>(null);
  const [overwriteApiKey, setOverwriteApiKey] = React.useState("");
  const [updatingKey, setUpdatingKey] = React.useState(false);

  const [startingSync, setStartingSync] = React.useState(false);
  const [testingId, setTestingId] = React.useState<number | null>(null);
  const [feedback, setFeedback] = React.useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const anySyncing = servers.some((s) => s.lastStatus === "Syncing");

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

  async function handleTest(server: WsusServerItem) {
    setTestingId(server.id);
    setFeedback(null);
    try {
      const res = await fetch(`/api/wsus-servers/${server.id}/test`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Connection test failed");
      }
      setFeedback({
        type: "success",
        message: `Connected to ${server.name} (Status: ${data.health?.status ?? "Healthy"}).`,
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message:
          err instanceof Error
            ? `${server.name}: ${err.message}`
            : "Connection failed",
      });
    } finally {
      setTestingId(null);
    }
  }

  async function handleSync(serverId: number | "all") {
    setStartingSync(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/wsus-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(serverId === "all" ? {} : { serverId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? "Failed to start synchronization");
      }

      setFeedback({
        type: "success",
        message: "Synchronization started in background. Status will update automatically.",
      });
      await fetchLatestServers();
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Sync failed",
      });
    } finally {
      setStartingSync(false);
    }
  }

  async function handleToggleEnabled(server: WsusServerItem) {
    await fetch(`/api/wsus-servers/${server.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !server.enabled }),
    });
    await refreshServers();
  }

  async function handleDelete(server: WsusServerItem) {
    await fetch(`/api/wsus-servers/${server.id}`, { method: "DELETE" });
    setFeedback({
      type: "success",
      message: `Removed WSUS server "${server.name}".`,
    });
    await refreshServers();
  }

  async function handleOverwriteApiKey(e: React.FormEvent) {
    e.preventDefault();
    if (!editingApiKeyServer) return;

    const trimmedKey = overwriteApiKey.trim();
    if (!trimmedKey) {
      setFeedback({
        type: "error",
        message: "New API key is required.",
      });
      return;
    }

    setUpdatingKey(true);
    setFeedback(null);

    try {
      const res = await fetch(`/api/wsus-servers/${editingApiKeyServer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: trimmedKey }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to update API key");
      }

      const serverName = editingApiKeyServer.name;
      setEditingApiKeyServer(null);
      setOverwriteApiKey("");
      setFeedback({
        type: "success",
        message: `Overwrote API key for "${serverName}".`,
      });
      await refreshServers();
    } catch (err) {
      setFeedback({
        type: "error",
        message:
          err instanceof Error ? err.message : "Failed to update API key",
      });
    } finally {
      setUpdatingKey(false);
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
                startingSync ||
                anySyncing ||
                servers.filter((s) => s.enabled).length === 0
              }
              onClick={() => handleSync("all")}
            >
              {startingSync || anySyncing ? (
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
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {servers.map((srv) => (
                  <TableRow key={srv.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span>{srv.name}</span>
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
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {allowSync && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={testingId === srv.id}
                              onClick={() => handleTest(srv)}
                              title="Test /health connection"
                            >
                              {testingId === srv.id ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <Activity className="size-3.5" />
                              )}
                              <span className="ml-1 hidden sm:inline">Test</span>
                            </Button>
                            <Button
                              size="sm"
                              disabled={
                                !srv.enabled ||
                                startingSync ||
                                srv.lastStatus === "Syncing"
                              }
                              onClick={() => handleSync(srv.id)}
                            >
                              {srv.lastStatus === "Syncing" ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <RefreshCw className="size-3.5" />
                              )}
                              <span className="ml-1">
                                {srv.lastStatus === "Syncing" ? "Syncing" : "Sync"}
                              </span>
                            </Button>
                          </>
                        )}
                        {allowManage && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setOverwriteApiKey("");
                                setEditingApiKeyServer(srv);
                              }}
                              title="Overwrite API key"
                            >
                              <KeyRound className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleToggleEnabled(srv)}
                              title={srv.enabled ? "Disable" : "Enable"}
                            >
                              <Power
                                className={`size-4 ${
                                  srv.enabled
                                    ? "text-emerald-600"
                                    : "text-muted-foreground"
                                }`}
                              />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(srv)}
                              title="Remove server"
                            >
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </>
                        )}
                        {!allowSync && !allowManage && (
                          <span className="text-xs text-muted-foreground">
                            Read-only
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Overwrite API Key Dialog (never displays existing key) */}
      <Dialog
        open={Boolean(editingApiKeyServer)}
        onOpenChange={(open) => {
          if (!open && !updatingKey) {
            setEditingApiKeyServer(null);
            setOverwriteApiKey("");
          }
        }}
      >
        <DialogContent>
          <form onSubmit={handleOverwriteApiKey}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <KeyRound className="size-4" />
                Overwrite API Key: {editingApiKeyServer?.name}
              </DialogTitle>
              <DialogDescription>
                For security, the existing API key is never displayed. Enter a
                new key to overwrite it.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="overwrite-wsus-key">
                  New API Key (X-Api-Key)
                </Label>
                <Input
                  id="overwrite-wsus-key"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Enter new API key..."
                  value={overwriteApiKey}
                  onChange={(e) => setOverwriteApiKey(e.target.value)}
                  required
                  disabled={updatingKey}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditingApiKeyServer(null);
                  setOverwriteApiKey("");
                }}
                disabled={updatingKey}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updatingKey}>
                {updatingKey && (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                )}
                Overwrite Key
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
