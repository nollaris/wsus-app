"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { canResetDatabase } from "@/lib/rbac";
import {
  Sun,
  Moon,
  Monitor,
  Database,
  Trash2,
  User,
  LogOut,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@workspace/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/ui/card";
import { Badge } from "@workspace/ui/components/ui/badge";
import { Input } from "@workspace/ui/components/ui/input";
import { Label } from "@workspace/ui/components/ui/label";
import { Alert, AlertDescription } from "@workspace/ui/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";

export interface TableCounts {
  classifications: number;
  products: number;
  clientStatus: number;
  patchInventory: number;
  clientPatchStatus: number;
  synchronizationHistory: number;
  synchronizationSetting: number;
}

interface SettingsPanelProps {
  user: { username: string; role: string };
  initialCounts: TableCounts;
}

const emptySubscribe = () => () => {};

export function SettingsPanel({ user, initialCounts }: SettingsPanelProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const [counts, setCounts] = useState<TableCounts>(initialCounts);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  async function handleResetConfirm() {
    if (!dialogOpen) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/settings/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "truncate", confirmText }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({
          type: "error",
          message: data.error || "Database operation failed.",
        });
        return;
      }
      if (data.counts) setCounts(data.counts);
      setFeedback({
        type: "success",
        message: "All WSUS tables have been cleared.",
      });
      setDialogOpen(false);
      setConfirmText("");
      router.refresh();
    } catch {
      setFeedback({
        type: "error",
        message: "Network error while performing database operation.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const themeOptions = [
    { id: "light", label: "Light", icon: Sun },
    { id: "dark", label: "Dark", icon: Moon },
    { id: "system", label: "System", icon: Monitor },
  ] as const;

  const tableRows = [
    { label: "Client Status", count: counts.clientStatus },
    { label: "Patch Inventory", count: counts.patchInventory },
    { label: "Client Patch Status", count: counts.clientPatchStatus },
    { label: "Synchronization History", count: counts.synchronizationHistory },
    { label: "Synchronization Settings", count: counts.synchronizationSetting },
    { label: "Products", count: counts.products },
    { label: "Classifications", count: counts.classifications },
  ];

  return (
    <div className="space-y-6">
      {feedback && (
        <Alert variant={feedback.type === "error" ? "destructive" : "default"}>
          {feedback.type === "error" ? (
            <AlertTriangle className="h-4 w-4" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          )}
          <AlertDescription>{feedback.message}</AlertDescription>
        </Alert>
      )}

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Choose how the WSUS Portal looks across light and dark modes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3 max-w-xl">
            {themeOptions.map((opt) => {
              const Icon = opt.icon;
              const active = mounted && theme === opt.id;
              return (
                <Button
                  key={opt.id}
                  type="button"
                  variant={active ? "default" : "outline"}
                  className="justify-start gap-2 h-11"
                  onClick={() => setTheme(opt.id)}
                >
                  <Icon className="h-4 w-4" />
                  <span>{opt.label}</span>
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Account & Environment */}
      <Card>
        <CardHeader>
          <CardTitle>Account &amp; Session</CardTitle>
          <CardDescription>
            Current authenticated session and database connection info.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <User className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 font-medium">
                <span>{user.username}</span>
                <Badge variant="secondary" className="capitalize">
                  {user.role}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground font-mono">
                PostgreSQL &middot; localhost:5432/wsus_db
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={handleLogout} className="gap-2">
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </CardContent>
      </Card>

      {/* Database Management & Reset */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Database Management &amp; Reset
          </CardTitle>
          <CardDescription>
            Inspect PostgreSQL table row counts or clear all WSUS records (user
            accounts are preserved).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {tableRows.map((t) => (
              <div
                key={t.label}
                className="rounded-lg border bg-muted/30 px-3 py-2.5"
              >
                <div className="text-xs text-muted-foreground">{t.label}</div>
                <div className="mt-1 text-lg font-bold font-mono">
                  {t.count.toLocaleString()}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            {canResetDatabase(user.role) ? (
              <Button
                variant="destructive"
                className="gap-2"
                onClick={() => {
                  setConfirmText("");
                  setDialogOpen(true);
                }}
              >
                <Trash2 className="h-4 w-4" />
                Clear All WSUS Data
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Database reset controls require an <span className="font-semibold">Admin</span> role.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setDialogOpen(false);
            setConfirmText("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear All WSUS Data?</DialogTitle>
            <DialogDescription>
              This will permanently delete all rows from all 7 WSUS data tables
              in PostgreSQL. User accounts will be preserved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="confirm-reset">
              Type <code className="font-mono font-semibold">RESET</code> to
              confirm
            </Label>
            <Input
              id="confirm-reset"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="RESET"
              disabled={busy}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={confirmText.trim() !== "RESET" || busy}
              onClick={handleResetConfirm}
            >
              {busy ? "Processing..." : "Confirm Clear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
