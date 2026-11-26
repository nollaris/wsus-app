"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
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
  SlidersHorizontal,
  Square,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { canManageServers, canTriggerSync } from "@/lib/rbac";
import type { SyncLimits, SyncScope } from "@/lib/wsus-api-sync";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/ui/tabs";

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
  synchronizationContent?: React.ReactNode;
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

async function parseJsonSafe<T>(res: Response): Promise<T | null> {
  const text = await res.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function WsusServerControl({
  initialServer,
  userRole,
  synchronizationContent,
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
  const [cancelling, setCancelling] = React.useState(false);
  const [showLimits, setShowLimits] = React.useState(false);
  const [maxComputers, setMaxComputers] = React.useState("");
  const [maxUpdates, setMaxUpdates] = React.useState("");
  const [maxClientDetails, setMaxClientDetails] = React.useState("");
  const [concurrency, setConcurrency] = React.useState("3");
  const [requestTimeoutSec, setRequestTimeoutSec] = React.useState("120");
  const [approvedUpdatesOnly, setApprovedUpdatesOnly] = React.useState(false);
  const [skipInstalledClientPatches, setSkipInstalledClientPatches] =
    React.useState(false);
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
    if (!res.ok) return null;
    const data = await parseJsonSafe<{ servers?: WsusServerDetailItem[] }>(res);
    const found = (data?.servers ?? []).find((s) => s.id === server.id);
    if (found) {
      setServer(found);
      return found;
    }
    return null;
  }, [server.id]);

  React.useEffect(() => {
    if (!isSyncing) return;
    const timer = window.setInterval(() => {
      void refreshServer().then((found) => {
        if (found && found.lastStatus !== "Syncing") {
          React.startTransition(() => {
            router.refresh();
          });
        }
      });
    }, 3000);
    return () => window.clearInterval(timer);
  }, [isSyncing, refreshServer, router]);

  React.useEffect(() => {
    if (!feedback || feedback.type !== "success") return;
    const timer = window.setTimeout(() => {
      setFeedback(null);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  async function handleTest() {
    setTesting(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/wsus-servers/${server.id}/test`, {
        method: "POST",
      });
      const data = await parseJsonSafe<{
        ok?: boolean;
        error?: string;
        health?: { status?: string };
      }>(res);
      if (!res.ok || !data?.ok) {
        throw new Error(
          data?.error ?? `Connection test failed (HTTP ${res.status})`
        );
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

  function buildLimitsPayload(): SyncLimits {
    const toPositiveInt = (raw: string): number | undefined => {
      const n = Number(raw.trim());
      return Number.isFinite(n) && n > 0 ? Math.trunc(n) : undefined;
    };
    const timeoutSec = toPositiveInt(requestTimeoutSec);
    return {
      maxComputers: toPositiveInt(maxComputers),
      maxUpdates: toPositiveInt(maxUpdates),
      maxClientDetailComputers: toPositiveInt(maxClientDetails),
      concurrency: toPositiveInt(concurrency),
      requestTimeoutMs: timeoutSec ? timeoutSec * 1000 : undefined,
      approvedUpdatesOnly,
      skipInstalledClientPatches,
    };
  }

  async function handleSync(scope: SyncScope) {
    setStartingScope(scope);
    setFeedback(null);
    try {
      const res = await fetch("/api/wsus-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serverId: server.id,
          scope,
          limits: buildLimitsPayload(),
        }),
      });
      const data = await parseJsonSafe<{ success?: boolean; error?: string }>(
        res
      );
      if (!res.ok || !data?.success) {
        throw new Error(
          data?.error ?? `Failed to start synchronization (HTTP ${res.status})`
        );
      }
      setFeedback({
        type: "success",
        message: `Started ${scope === "all" ? "full synchronization" : `${scope} sync`} in background.`,
      });
      await refreshServer();
      React.startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Sync failed",
      });
    } finally {
      setStartingScope(null);
    }
  }

  async function handleCancelSync() {
    setCancelling(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/wsus-sync", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverId: server.id }),
      });
      const data = await parseJsonSafe<{ success?: boolean; error?: string }>(
        res
      );
      if (!res.ok || !data?.success) {
        throw new Error(
          data?.error ?? `Failed to cancel synchronization (HTTP ${res.status})`
        );
      }
      setFeedback({
        type: "success",
        message: "Synchronization cancelled.",
      });
      await refreshServer();
      React.startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Cancel failed",
      });
    } finally {
      setCancelling(false);
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
        <div className="fixed bottom-4 right-4 z-50 w-[calc(100%-2rem)] max-w-md">
          <Alert
            variant={feedback.type === "error" ? "destructive" : "default"}
            className="pr-9 shadow-lg"
          >
            {feedback.type === "success" ? (
              <CheckCircle2 className="size-4" />
            ) : (
              <XCircle className="size-4" />
            )}
            <AlertDescription>{feedback.message}</AlertDescription>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="absolute top-2.5 right-2.5 rounded-sm p-0.5 text-muted-foreground opacity-70 transition-opacity hover:opacity-100"
              aria-label="Dismiss notification"
            >
              <X className="size-3.5" />
            </button>
          </Alert>
        </div>
      )}

      {server.lastStatus === "Failed" && server.lastError && (
        <Alert variant="destructive">
          <XCircle className="size-4" />
          <AlertDescription>
            Last sync error: <span className="font-mono">{server.lastError}</span>
          </AlertDescription>
        </Alert>
      )}

      {server.lastStatus === "Partial" && server.lastError && (
        <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300">
          <AlertTriangle className="size-4" />
          <AlertDescription>
            Partial sync warning: <span className="font-mono">{server.lastError}</span>
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="sync" className="space-y-4">
        <TabsList
          className={
            allowManage
              ? "grid w-full max-w-sm grid-cols-2"
              : "grid w-full max-w-[220px] grid-cols-1"
          }
        >
          <TabsTrigger value="sync">
            <RefreshCw />
            Synchronization
          </TabsTrigger>
          {allowManage && (
            <TabsTrigger value="settings">
              <SlidersHorizontal />
              Server settings
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="sync" className="space-y-4">
      {/* Sync & Endpoint Controls */}
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Synchronization Controls</CardTitle>
            <CardDescription className="mt-1">
              Test connectivity or trigger a full or per-endpoint sync.
            </CardDescription>
          </div>
          {allowSync && (
            <div className="flex flex-wrap items-center gap-2">
              {isSyncing && (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={cancelling}
                  onClick={handleCancelSync}
                >
                  {cancelling ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Square className="mr-2 size-3.5 fill-current" />
                  )}
                  Cancel Sync
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowLimits((v) => !v)}
              >
                <SlidersHorizontal className="mr-2 size-4" />
                Request Limits
              </Button>
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
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {allowSync && showLimits && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <div className="space-y-1.5">
                  <Label htmlFor="limit-computers" className="text-xs">
                    Max Computers
                  </Label>
                  <Input
                    id="limit-computers"
                    type="number"
                    min={0}
                    placeholder="Unlimited"
                    value={maxComputers}
                    onChange={(e) => setMaxComputers(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="limit-updates" className="text-xs">
                    Max Updates
                  </Label>
                  <Input
                    id="limit-updates"
                    type="number"
                    min={0}
                    placeholder="Unlimited"
                    value={maxUpdates}
                    onChange={(e) => setMaxUpdates(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="limit-client-details" className="text-xs">
                    Max Client Details
                  </Label>
                  <Input
                    id="limit-client-details"
                    type="number"
                    min={0}
                    placeholder="Unlimited"
                    value={maxClientDetails}
                    onChange={(e) => setMaxClientDetails(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="limit-concurrency" className="text-xs">
                    Concurrency (1–16)
                  </Label>
                  <Input
                    id="limit-concurrency"
                    type="number"
                    min={1}
                    max={16}
                    value={concurrency}
                    onChange={(e) => setConcurrency(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="limit-timeout" className="text-xs">
                    Timeout per request (sec)
                  </Label>
                  <Input
                    id="limit-timeout"
                    type="number"
                    min={1}
                    max={120}
                    value={requestTimeoutSec}
                    onChange={(e) => setRequestTimeoutSec(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Default: 120 seconds per WSUS API request.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-6 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="size-4 rounded border"
                    checked={approvedUpdatesOnly}
                    onChange={(e) => setApprovedUpdatesOnly(e.target.checked)}
                  />
                  <span>Approved updates only (skip unapproved &amp; declined)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="size-4 rounded border"
                    checked={skipInstalledClientPatches}
                    onChange={(e) =>
                      setSkipInstalledClientPatches(e.target.checked)
                    }
                  />
                  <span>
                    Skip installed patches in Client Patch Status (faster)
                  </span>
                </label>
              </div>
            </div>
          )}
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
          {synchronizationContent}
        </TabsContent>

      {/* Server Configuration (Admin Only) */}
      {allowManage && (
        <TabsContent value="settings" className="space-y-4">
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
        </TabsContent>
      )}
      </Tabs>

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
