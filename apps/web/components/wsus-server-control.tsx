"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  CheckCircle2,
  Database,
  History,
  KeyRound,
  Loader2,
  Monitor,
  Power,
  RefreshCw,
  Save,
  ShieldAlert,
  Trash2,
  XCircle,
} from "lucide-react";
import { canManageServers, canTriggerSync } from "@/lib/rbac";
import type { SyncScope } from "@/lib/wsus-api-sync";
import { Alert, AlertDescription } from "@workspace/ui/components/ui/alert";
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
} from "@workspace/ui/components/ui/dialog";
import { Input } from "@workspace/ui/components/ui/input";
import { Label } from "@workspace/ui/components/ui/label";

export interface WsusServerDetailItem {
  id: number;
  name: string;
  baseUrl: string;
  enabled: boolean;
  lastSyncedAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
}

interface WsusServerControlProps {
  initialServer: WsusServerDetailItem;
  userRole: string;
}

const ENDPOINT_SCOPES: Array<{
  scope: SyncScope;
  label: string;
  endpoint: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    scope: "all",
    label: "Full Sync",
    endpoint: "All endpoints",
    description: "Sync computers, updates, sync history, and client patch status.",
    icon: RefreshCw,
  },
  {
    scope: "computers",
    label: "Computers Only",
    endpoint: "GET /computers",
    description: "Fast refresh of managed client inventory and last-sync times.",
    icon: Monitor,
  },
  {
    scope: "updates",
    label: "Updates Only",
    endpoint: "GET /updates",
    description: "Refresh patch catalog, approvals, and severity metadata.",
    icon: ShieldAlert,
  },
  {
    scope: "sync",
    label: "Sync History",
    endpoint: "GET /sync",
    description: "Instant pull of WSUS schedule settings and sync run history.",
    icon: History,
  },
  {
    scope: "client-patches",
    label: "Client Patch Status",
    endpoint: "GET /computers/{id}",
    description: "Deep per-client compliance scan across all managed computers.",
    icon: Database,
  },
];

export function WsusServerControl({
  initialServer,
  userRole,
}: WsusServerControlProps) {
  const router = useRouter();
  const allowManage = canManageServers(userRole);
  const allowSync = canTriggerSync(userRole);

  const [server, setServer] = React.useState<WsusServerDetailItem>(initialServer);
  const [name, setName] = React.useState(initialServer.name);
  const [baseUrl, setBaseUrl] = React.useState(initialServer.baseUrl);
  const [savingConfig, setSavingConfig] = React.useState(false);

  const [testing, setTesting] = React.useState(false);
  const [startingScope, setStartingScope] = React.useState<SyncScope | null>(
    null
  );
  const [toggling, setToggling] = React.useState(false);

  const [keyDialogOpen, setKeyDialogOpen] = React.useState(false);
  const [newApiKey, setNewApiKey] = React.useState("");
  const [updatingKey, setUpdatingKey] = React.useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const [feedback, setFeedback] = React.useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const isSyncing = server.lastStatus === "Syncing";
  const normalizedName = name.trim();
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
  const hasConfigChanges =
    normalizedName !== server.name || normalizedBaseUrl !== server.baseUrl;

  const refreshServer = React.useCallback(async () => {
    const res = await fetch("/api/wsus-servers", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { servers?: WsusServerDetailItem[] };
    const found = (data.servers ?? []).find((s) => s.id === server.id);
    if (found) {
      setServer(found);
    }
  }, [server.id]);

  React.useEffect(() => {
    if (!isSyncing) return;
    const timer = window.setInterval(() => {
      void refreshServer().then(() => {
        router.refresh();
      });
    }, 3000);
    return () => window.clearInterval(timer);
  }, [isSyncing, refreshServer, router]);

  async function handleTest() {
    setTesting(true);
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
        message: err instanceof Error ? err.message : "Connection test failed",
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleSync(scope: SyncScope) {
    setStartingScope(scope);
    setFeedback(null);
    try {
      const res = await fetch("/api/wsus-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverId: server.id, scope }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? "Failed to start synchronization");
      }
      setFeedback({
        type: "success",
        message: `Started ${scope === "all" ? "full synchronization" : `${scope} sync`} in background.`,
      });
      await refreshServer();
      router.refresh();
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Sync failed",
      });
    } finally {
      setStartingScope(null);
    }
  }

  async function handleToggleEnabled() {
    setToggling(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/wsus-servers/${server.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !server.enabled }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to update server status");
      }
      setServer(data.server);
      setFeedback({
        type: "success",
        message: `Server ${data.server.enabled ? "enabled" : "disabled"}.`,
      });
      router.refresh();
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Update failed",
      });
    } finally {
      setToggling(false);
    }
  }

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    const payload: { name?: string; baseUrl?: string } = {};
    if (normalizedName && normalizedName !== server.name) {
      payload.name = normalizedName;
    }
    if (normalizedBaseUrl && normalizedBaseUrl !== server.baseUrl) {
      payload.baseUrl = normalizedBaseUrl;
    }
    if (Object.keys(payload).length === 0) {
      return;
    }

    setSavingConfig(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/wsus-servers/${server.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to save server settings");
      }
      setServer(data.server);
      setName(data.server.name);
      setBaseUrl(data.server.baseUrl);
      setFeedback({
        type: "success",
        message: "Updated server configuration.",
      });
      router.refresh();
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Save failed",
      });
    } finally {
      setSavingConfig(false);
    }
  }

  async function handleOverwriteApiKey(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newApiKey.trim();
    if (!trimmed) return;
    setUpdatingKey(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/wsus-servers/${server.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to overwrite API key");
      }
      setKeyDialogOpen(false);
      setNewApiKey("");
      setFeedback({
        type: "success",
        message: `Overwrote API key for "${server.name}".`,
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message:
          err instanceof Error ? err.message : "Failed to overwrite API key",
      });
    } finally {
      setUpdatingKey(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/wsus-servers/${server.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to delete server");
      }
      router.push("/sync");
      router.refresh();
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Delete failed",
      });
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {feedback && (
        <Alert
          variant={feedback.type === "error" ? "destructive" : "default"}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="size-4" />
          ) : (
            <XCircle className="size-4" />
          )}
          <AlertDescription>{feedback.message}</AlertDescription>
        </Alert>
      )}

      {server.lastStatus === "Failed" && server.lastError && (
        <Alert variant="destructive">
          <XCircle className="size-4" />
          <AlertDescription>
            Last sync error: <span className="font-mono">{server.lastError}</span>
          </AlertDescription>
        </Alert>
      )}

      {/* Sync & Endpoint Controls */}
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Synchronization Controls</CardTitle>
            <CardDescription className="mt-1">
              Test connectivity or trigger a full or per-endpoint sync.
              {server.lastSyncedAt && (
                <>
                  {" "}
                  Last synced:{" "}
                  <span className="font-mono">
                    {new Date(server.lastSyncedAt).toLocaleString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                      hour12: false,
                      timeZone: "Asia/Bangkok",
                    })}
                  </span>
                </>
              )}
            </CardDescription>
          </div>
          {allowSync && (
            <Button
              variant="outline"
              size="sm"
              disabled={testing}
              onClick={handleTest}
            >
              {testing ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Activity className="mr-2 size-4" />
              )}
              Test Connection
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {allowSync ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {ENDPOINT_SCOPES.map((item) => {
                const Icon = item.icon;
                const busy = startingScope === item.scope || isSyncing;
                return (
                  <div
                    key={item.scope}
                    className="flex flex-col justify-between rounded-lg border p-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 font-medium text-sm">
                        <Icon className="size-4 text-primary" />
                        <span>{item.label}</span>
                      </div>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {item.endpoint}
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed pt-1">
                        {item.description}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant={item.scope === "all" ? "default" : "outline"}
                      className="mt-3 w-full"
                      disabled={!server.enabled || busy}
                      onClick={() => handleSync(item.scope)}
                    >
                      {busy ? (
                        <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-1.5 size-3.5" />
                      )}
                      {isSyncing ? "Syncing..." : `Run ${item.label}`}
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Operator or Admin role is required to test connections or trigger
              synchronizations.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Server Configuration (Admin Only) */}
      {allowManage && (
        <Card>
          <CardHeader>
            <CardTitle>Server Configuration</CardTitle>
            <CardDescription>
              Update endpoint details, overwrite the API key, toggle active
              status, or remove this server.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <form
              onSubmit={handleSaveConfig}
              className="grid gap-4 sm:grid-cols-2"
            >
              <div className="space-y-2">
                <Label htmlFor="ctrl-name">Server Name</Label>
                <Input
                  id="ctrl-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={savingConfig}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ctrl-url">API Base URL</Label>
                <Input
                  id="ctrl-url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  required
                  disabled={savingConfig}
                />
              </div>
              <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={savingConfig || !hasConfigChanges}
                  >
                    {savingConfig ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 size-4" />
                    )}
                    Save Changes
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setNewApiKey("");
                      setKeyDialogOpen(true);
                    }}
                  >
                    <KeyRound className="mr-2 size-4" />
                    Overwrite API Key
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={toggling}
                    onClick={handleToggleEnabled}
                  >
                    {toggling ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Power
                        className={`mr-2 size-4 ${
                          server.enabled
                            ? "text-emerald-600"
                            : "text-muted-foreground"
                        }`}
                      />
                    )}
                    {server.enabled ? "Disable Server" : "Enable Server"}
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  <Trash2 className="mr-2 size-4" />
                  Delete Server
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Overwrite API Key Dialog */}
      <Dialog
        open={keyDialogOpen}
        onOpenChange={(open) => {
          if (!updatingKey) {
            setKeyDialogOpen(open);
            if (!open) setNewApiKey("");
          }
        }}
      >
        <DialogContent>
          <form onSubmit={handleOverwriteApiKey}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <KeyRound className="size-4" />
                Overwrite API Key: {server.name}
              </DialogTitle>
              <DialogDescription>
                For security, the existing API key is never displayed. Enter a
                new key to overwrite it.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <div className="space-y-2">
                <Label htmlFor="ctrl-new-key">New API Key (X-Api-Key)</Label>
                <Input
                  id="ctrl-new-key"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Enter new API key..."
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
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
                  setKeyDialogOpen(false);
                  setNewApiKey("");
                }}
                disabled={updatingKey}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updatingKey || !newApiKey.trim()}
              >
                {updatingKey && (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                )}
                Overwrite Key
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Server Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (!deleting) setDeleteDialogOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete WSUS Server?</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove{" "}
              <span className="font-semibold text-foreground">
                {server.name}
              </span>
              ? Existing synced records in PostgreSQL will remain until cleared.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="mr-2 size-4 animate-spin" />}
              Delete Server
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
