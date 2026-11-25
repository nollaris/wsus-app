"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button } from "@workspace/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/ui/card";
import { Input } from "@workspace/ui/components/ui/input";
import { Label } from "@workspace/ui/components/ui/label";

interface ServerOption {
  id: number;
  name: string;
}

interface GroupOption {
  groupId: string;
  name: string;
}

interface ComputerOption {
  computerId: string;
  fullDomainName: string;
}

interface UpdateOption {
  updateId: string;
  revisionNumber: number;
  title: string;
}

interface ApprovalSchedule {
  id: number;
  serverId: number;
  updateTitle: string;
  targetGroupName: string;
  scheduledAt: string;
  status: string;
  createdBy: string;
  error: string | null;
  server: { name: string };
}

function getErrorMessage(data: unknown, fallback: string) {
  if (
    data &&
    typeof data === "object" &&
    "error" in data &&
    typeof data.error === "string"
  ) {
    return data.error;
  }
  return fallback;
}

export function WsusControlPanel({ servers }: { servers: ServerOption[] }) {
  const [serverId, setServerId] = useState(servers[0]?.id.toString() ?? "");
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [computers, setComputers] = useState<ComputerOption[]>([]);
  const [updates, setUpdates] = useState<UpdateOption[]>([]);
  const [schedules, setSchedules] = useState<ApprovalSchedule[]>([]);
  const [groupName, setGroupName] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [selectedComputer, setSelectedComputer] = useState("");
  const [selectedUpdate, setSelectedUpdate] = useState("");
  const [selectedApprovalGroup, setSelectedApprovalGroup] = useState("");
  const [computerSearch, setComputerSearch] = useState("");
  const [computerQuery, setComputerQuery] = useState("");
  const [updateSearch, setUpdateSearch] = useState("");
  const [updateQuery, setUpdateQuery] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    if (!serverId) return;
    try {
      const [controlResponse, scheduleResponse] = await Promise.all([
        fetch(
          `/api/wsus-servers/${serverId}/control?${new URLSearchParams({
            computerSearch: computerQuery,
            updateSearch: updateQuery,
          })}`,
          { cache: "no-store" }
        ),
        fetch(`/api/wsus-approvals?serverId=${serverId}`, { cache: "no-store" }),
      ]);
      const [controlData, scheduleData] = await Promise.all([
        controlResponse.json(),
        scheduleResponse.json(),
      ]);
      if (!controlResponse.ok) {
        throw new Error(getErrorMessage(controlData, "Could not load WSUS data."));
      }
      if (!scheduleResponse.ok) {
        throw new Error(getErrorMessage(scheduleData, "Could not load approval schedules."));
      }
      setGroups(controlData.groups ?? []);
      setComputers(controlData.computers ?? []);
      setUpdates(controlData.updates ?? []);
      setSchedules(scheduleData.schedules ?? []);
      setSelectedGroup((current) => current || controlData.groups?.[0]?.groupId || "");
      setSelectedApprovalGroup((current) => current || controlData.groups?.[0]?.groupId || "");
      setSelectedComputer((current) => current || controlData.computers?.[0]?.computerId || "");
      setSelectedUpdate((current) => current || firstUpdateKey(controlData.updates ?? []));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load WSUS data.");
    } finally {
      setLoading(false);
    }
  }, [serverId, computerQuery, updateQuery]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setComputerQuery(computerSearch.trim()),
      250
    );
    return () => window.clearTimeout(timer);
  }, [computerSearch]);

  useEffect(() => {
    const timer = window.setTimeout(() => setUpdateQuery(updateSearch.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [updateSearch]);

  useEffect(() => {
    if (!serverId) return;
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [serverId, refresh]);

  async function postControl(body: Record<string, unknown>, successMessage: string) {
    if (!serverId) return;
    setBusyAction(String(body.action ?? ""));
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/wsus-servers/${serverId}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data: unknown = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(data, "WSUS operation failed."));
      setNotice(successMessage);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "WSUS operation failed.");
    } finally {
      setBusyAction("");
    }
  }

  async function handleCreateGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await postControl({ action: "create-group", name: groupName }, "Computer group created.");
    setGroupName("");
  }

  async function handleAddComputer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await postControl(
      { action: "add-computer", groupId: selectedGroup, computerId: selectedComputer },
      "Computer added to group."
    );
  }

  async function handleSync() {
    await postControl({ action: "sync" }, "WSUS upstream synchronization started.");
  }

  async function handlePortalSync() {
    if (!serverId) return;
    setBusyAction("portal-sync");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/wsus-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverId: Number(serverId), scope: "all" }),
      });
      const data: unknown = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(data, "Portal sync failed."));
      setNotice("WSUS data pull started. It will update the portal catalog when complete.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Portal sync failed.");
    } finally {
      setBusyAction("");
    }
  }

  async function handleImmediateApproval() {
    const update = findUpdate(updates, selectedUpdate);
    if (!update || !selectedApprovalGroup) return;
    const targetGroup = groups.find((group) => group.groupId === selectedApprovalGroup);
    if (!window.confirm(`Approve "${update.title}" for installation to "${targetGroup?.name ?? "the selected group"}" now?`)) {
      return;
    }
    await postControl(
      {
        action: "approve",
        updateId: update.updateId,
        revisionNumber: update.revisionNumber,
        targetGroupId: selectedApprovalGroup,
      },
      "Update approved for installation."
    );
  }

  async function handleScheduleApproval(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!serverId) return;
    const update = findUpdate(updates, selectedUpdate);
    const group = groups.find((item) => item.groupId === selectedApprovalGroup);
    const date = new Date(scheduledAt);
    if (!update || !group || !Number.isFinite(date.getTime())) {
      setError("Select an update, target group, and valid schedule time.");
      return;
    }

    setBusyAction("schedule");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/wsus-approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serverId: Number(serverId),
          updateId: update.updateId,
          revisionNumber: update.revisionNumber,
          targetGroupId: group.groupId,
          scheduledAt: date.toISOString(),
        }),
      });
      const data: unknown = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(data, "Could not schedule approval."));
      setNotice("Update approval scheduled.");
      setScheduledAt("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not schedule approval.");
    } finally {
      setBusyAction("");
    }
  }

  async function cancelSchedule(id: number) {
    setBusyAction(`cancel-${id}`);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/wsus-approvals/${id}`, { method: "DELETE" });
      const data: unknown = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(data, "Could not cancel schedule."));
      setNotice("Scheduled approval cancelled.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel schedule.");
    } finally {
      setBusyAction("");
    }
  }

  if (servers.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          No enabled WSUS servers are configured.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:max-w-sm">
        <Label htmlFor="control-server">WSUS server</Label>
        <select
          id="control-server"
          className="h-10 rounded-md border bg-background px-3 text-sm"
          value={serverId}
          onChange={(event) => {
            setGroups([]);
            setComputers([]);
            setUpdates([]);
            setSchedules([]);
            setSelectedGroup("");
            setSelectedApprovalGroup("");
            setSelectedComputer("");
            setSelectedUpdate("");
            setLoading(true);
            setError("");
            setServerId(event.target.value);
          }}
        >
          {servers.map((server) => (
            <option key={server.id} value={server.id}>{server.name}</option>
          ))}
        </select>
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Computer groups</CardTitle>
            <CardDescription>Create a WSUS group or add a computer to an existing group.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <form className="space-y-2" onSubmit={handleCreateGroup}>
              <Label htmlFor="new-group-name">New group name</Label>
              <div className="flex gap-2">
                <Input
                  id="new-group-name"
                  value={groupName}
                  maxLength={256}
                  onChange={(event) => setGroupName(event.target.value)}
                  placeholder="Pilot group"
                  required
                />
                <Button type="submit" disabled={loading || busyAction !== ""}>
                  Create
                </Button>
              </div>
            </form>

            <form className="space-y-3 border-t pt-4" onSubmit={handleAddComputer}>
              <Label htmlFor="member-group">Add computer to group</Label>
              <select
                id="member-group"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={selectedGroup}
                onChange={(event) => setSelectedGroup(event.target.value)}
                required
              >
                {groups.map((group) => (
                  <option key={group.groupId} value={group.groupId}>{group.name}</option>
                ))}
              </select>
              <Input
                aria-label="Search computers"
                placeholder="Search computers..."
                value={computerSearch}
                onChange={(event) => {
                  setSelectedComputer("");
                  setLoading(true);
                  setComputerSearch(event.target.value);
                }}
              />
              <select
                aria-label="Computer"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={selectedComputer}
                onChange={(event) => setSelectedComputer(event.target.value)}
                required
              >
                {computers.map((computer) => (
                  <option key={computer.computerId} value={computer.computerId}>
                    {computer.fullDomainName}
                  </option>
                ))}
              </select>
              <Button
                type="submit"
                variant="outline"
                disabled={loading || busyAction !== "" || groups.length === 0 || computers.length === 0}
              >
                Add member
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Synchronization</CardTitle>
            <CardDescription>
              Start upstream WSUS synchronization or pull current WSUS data into the portal.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button onClick={handleSync} disabled={loading || busyAction !== ""}>
              Start WSUS sync
            </Button>
            <Button
              variant="outline"
              onClick={handlePortalSync}
              disabled={loading || busyAction !== ""}
            >
              Pull data into portal
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Patch approvals</CardTitle>
          <CardDescription>
            Approval takes effect immediately, or at the selected future time. No installation deadline is set.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="space-y-2">
              <Label htmlFor="approval-update">Unapproved patch</Label>
              <Input
                aria-label="Search unapproved patches"
                placeholder="Search unapproved patches..."
                value={updateSearch}
                onChange={(event) => {
                  setSelectedUpdate("");
                  setLoading(true);
                  setUpdateSearch(event.target.value);
                }}
              />
              <select
                id="approval-update"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={selectedUpdate}
                onChange={(event) => setSelectedUpdate(event.target.value)}
              >
                {updates.map((update) => (
                  <option key={`${update.updateId}:${update.revisionNumber}`} value={updateKey(update)}>
                    {update.title} (r{update.revisionNumber})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="approval-group">Target group</Label>
              <select
                id="approval-group"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={selectedApprovalGroup}
                onChange={(event) => setSelectedApprovalGroup(event.target.value)}
              >
                {groups.map((group) => (
                  <option key={group.groupId} value={group.groupId}>{group.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Button
              onClick={handleImmediateApproval}
              disabled={loading || busyAction !== "" || !updates.length || !groups.length}
            >
              Approve now
            </Button>
            <form className="flex flex-wrap items-end gap-2" onSubmit={handleScheduleApproval}>
              <div className="space-y-2">
                <Label htmlFor="approval-scheduled-at">Schedule for</Label>
                <Input
                  id="approval-scheduled-at"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(event) => setScheduledAt(event.target.value)}
                  required
                />
              </div>
              <Button
                type="submit"
                variant="outline"
                disabled={loading || busyAction !== "" || !updates.length || !groups.length}
              >
                Schedule approval
              </Button>
            </form>
          </div>
          {updates.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No unapproved patches were returned. Refresh the portal catalog if the list is stale.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scheduled approvals</CardTitle>
          <CardDescription>Future approvals are executed by the portal&apos;s Node.js scheduler.</CardDescription>
        </CardHeader>
        <CardContent>
          {schedules.length === 0 ? (
            <p className="text-sm text-muted-foreground">No scheduled approvals.</p>
          ) : (
            <div className="space-y-3">
              {schedules.map((schedule) => (
                <div key={schedule.id} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium">{schedule.updateTitle}</p>
                    <p className="text-xs text-muted-foreground">
                      {schedule.server.name} · {schedule.targetGroupName} ·{" "}
                      {new Date(schedule.scheduledAt).toLocaleString()} · {schedule.status}
                    </p>
                    {schedule.error && <p className="mt-1 text-xs text-destructive">{schedule.error}</p>}
                  </div>
                  {schedule.status === "pending" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void cancelSchedule(schedule.id)}
                      disabled={busyAction !== ""}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function updateKey(update: UpdateOption) {
  return `${update.updateId}:${update.revisionNumber}`;
}

function firstUpdateKey(updates: UpdateOption[]) {
  return updates.length ? updateKey(updates[0]!) : "";
}

function findUpdate(updates: UpdateOption[], key: string) {
  return updates.find((update) => updateKey(update) === key);
}
