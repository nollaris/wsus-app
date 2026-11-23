"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  CheckCircle2,
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
}: {
  initialServers: WsusServerItem[];
}) {
  const router = useRouter();
  const [servers, setServers] = React.useState<WsusServerItem[]>(initialServers);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const [name, setName] = React.useState("");
  const [baseUrl, setBaseUrl] = React.useState(
    "http://wsus-hq.corp.local:8530/wsus-api/api/v1"
  );
  const [apiKey, setApiKey] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const [syncingId, setSyncingId] = React.useState<number | "all" | null>(null);
  const [testingId, setTestingId] = React.useState<number | null>(null);
  const [feedback, setFeedback] = React.useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  React.useEffect(() => {
    setServers(initialServers);
  }, [initialServers]);

  async function refreshServers() {
    const res = await fetch("/api/wsus-servers");
    if (res.ok) {
      const data = await res.json();
      setServers(data.servers ?? []);
    }
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
    setSyncingId(serverId);
    setFeedback(null);
    try {
      const res = await fetch("/api/wsus-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(serverId === "all" ? {} : { serverId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        const errMsg =
          data.error ??
          data.errors?.[0]?.error ??
          "Synchronization via API failed";
        throw new Error(errMsg);
      }

      const summary = (data.results ?? [])
        .map(
          (r: {
            serverName: string;
            computersCount: number;
            updatesCount: number;
          }) =>
            `${r.serverName}: ${r.computersCount} computers, ${r.updatesCount} updates`
        )
        .join(" | ");

      setFeedback({
        type: "success",
        message: `API Sync completed (${summary}).`,
      });
      await refreshServers();
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Sync failed",
      });
      await refreshServers();
    } finally {
      setSyncingId(null);
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
          <Button
            variant="outline"
            size="sm"
            disabled={
              syncingId !== null ||
              servers.filter((s) => s.enabled).length === 0
            }
            onClick={() => handleSync("all")}
          >
            {syncingId === "all" ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 size-4" />
            )}
            Sync All Enabled
          </Button>

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
                      {srv.lastStatus === "Success" ? (
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
                          disabled={!srv.enabled || syncingId !== null}
                          onClick={() => handleSync(srv.id)}
                        >
                          {syncingId === srv.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="size-3.5" />
                          )}
                          <span className="ml-1">Sync</span>
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
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
