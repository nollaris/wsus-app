"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Search,
  Monitor,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@workspace/ui/components/ui/button";
import { Input } from "@workspace/ui/components/ui/input";
import { Label } from "@workspace/ui/components/ui/label";
import { Badge } from "@workspace/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/ui/card";
import { getComplianceTier, splitTargetGroups } from "../_lib/wsus-compliance";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/ui/table";
import {
  SortableTableHead,
  type SortDir,
} from "@/components/sortable-table-head";
import { formatBangkokTimestamp } from "@/lib/format";

export interface ClientRow {
  serverName: string;
  computerTargetId: string;
  computerName: string;
  ipAddress: string;
  osDescription: string;
  make?: string | null;
  model?: string | null;
  clientVersion: string;
  computerRole: string;
  assignedTargetGroups: string;
  lastSyncTime: string | null;
  lastReportedStatusTime: string | null;
  installed: number;
  notApplicable: number;
  notInstalled: number;
  failed: number;
  applicable: number;
  complianceScore: number;
  isFullyCompliant: boolean;
}

type SortKey =
  | "computerName"
  | "serverName"
  | "ipAddress"
  | "osDescription"
  | "assignedTargetGroups"
  | "lastSyncTime"
  | "installed"
  | "notInstalled"
  | "failed"
  | "complianceScore";

function compareStrings(a: string, b: string) {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la < lb) return -1;
  if (la > lb) return 1;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function compareIp(a: string, b: string) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  if (
    pa.length === 4 &&
    pb.length === 4 &&
    pa.every((n) => !Number.isNaN(n)) &&
    pb.every((n) => !Number.isNaN(n))
  ) {
    for (let i = 0; i < 4; i++) {
      if (pa[i] !== pb[i]) return pa[i] - pb[i];
    }
    return 0;
  }
  return a.localeCompare(b);
}

export function ClientsTable({ clients }: { clients: ClientRow[] }) {
  const [search, setSearch] = useState("");
  const [serverFilter, setServerFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("computerName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      const defaultDesc =
        key === "installed" ||
        key === "notInstalled" ||
        key === "failed" ||
        key === "complianceScore" ||
        key === "lastSyncTime";
      setSortDir(defaultDesc ? "desc" : "asc");
    }
    setPage(1);
  }

  const servers = useMemo(() => {
    const set = new Set<string>();
    clients.forEach((c) => {
      if (c.serverName) set.add(c.serverName);
    });
    return Array.from(set).sort();
  }, [clients]);

  const groups = useMemo(() => {
    const set = new Set<string>();
    const serverClients = clients.filter(
      (c) => serverFilter === "all" || c.serverName === serverFilter,
    );
    for (const client of serverClients) {
      for (const g of splitTargetGroups(client.assignedTargetGroups)) {
        set.add(g);
      }
    }
    return Array.from(set).sort();
  }, [clients, serverFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter((c) => {
      if (serverFilter !== "all" && c.serverName !== serverFilter) {
        return false;
      }
      if (
        groupFilter !== "all" &&
        !splitTargetGroups(c.assignedTargetGroups).includes(groupFilter)
      ) {
        return false;
      }
      if (!q) return true;
      return (
        c.computerName.toLowerCase().includes(q) ||
        (c.make?.toLowerCase().includes(q) ?? false) ||
        (c.model?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [clients, search, serverFilter, groupFilter]);

  const summary = useMemo(() => {
    const total = filtered.length;
    let fullyCompliant = 0;
    let needingUpdates = 0;
    let withErrors = 0;
    for (const c of filtered) {
      if (c.isFullyCompliant) fullyCompliant++;
      if (c.notInstalled > 0) needingUpdates++;
      if (c.failed > 0) withErrors++;
    }
    const fleetScore = total > 0 ? (fullyCompliant / total) * 100 : 0;
    return {
      total,
      fullyCompliant,
      needingUpdates,
      withErrors,
      fleetScore,
      tier: getComplianceTier(fleetScore),
    };
  }, [filtered]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    const mul = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      switch (sortKey) {
        case "computerName":
          return compareStrings(a.computerName, b.computerName) * mul;
        case "serverName":
          return compareStrings(a.serverName, b.serverName) * mul;
        case "ipAddress":
          return compareIp(a.ipAddress, b.ipAddress) * mul;
        case "osDescription":
          return compareStrings(a.osDescription, b.osDescription) * mul;
        case "assignedTargetGroups":
          return (
            compareStrings(
              splitTargetGroups(a.assignedTargetGroups).join(", "),
              splitTargetGroups(b.assignedTargetGroups).join(", "),
            ) * mul
          );
        case "lastSyncTime": {
          const ta = a.lastSyncTime ? Date.parse(a.lastSyncTime) : 0;
          const tb = b.lastSyncTime ? Date.parse(b.lastSyncTime) : 0;
          return (ta - tb) * mul;
        }
        case "installed":
          return (
            (a.installed + a.notApplicable - (b.installed + b.notApplicable)) *
            mul
          );
        case "notInstalled":
          return (a.notInstalled - b.notInstalled) * mul;
        case "failed":
          return (a.failed - b.failed) * mul;
        case "complianceScore":
          return (a.complianceScore - b.complianceScore) * mul;
      }
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, currentPage, pageSize]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Total Compliance Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span
                className={`text-2xl font-bold tabular-nums ${summary.tier.textClass}`}
              >
                {Math.round(summary.fleetScore)}%
              </span>
              <Badge variant="secondary" className={summary.tier.badgeClass}>
                {summary.tier.label}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {summary.fullyCompliant} of {summary.total} computers fully
              compliant
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Fully Compliant Devices
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {summary.fullyCompliant.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              No pending updates or errors
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Needing Updates
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
              {summary.needingUpdates.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Devices with pending installs
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Devices With Errors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums text-destructive">
              {summary.withErrors.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Devices with failed updates
            </p>
          </CardContent>
        </Card>
      </div>
      <section
        aria-label="Client filters"
        className="space-y-4 rounded-2xl border bg-card p-4 sm:p-5"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative min-w-0 flex-1">
            <Label htmlFor="clients-search" className="sr-only">
              Search clients
            </Label>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="clients-search"
              placeholder="Search computer name"
              className="h-10 pl-9"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <SlidersHorizontal className="size-4" />
            Filter clients
          </div>
        </div>

        <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
          {servers.length > 0 && (
            <div className="min-w-0 space-y-1.5">
              <Label
                htmlFor="clients-server-filter"
                className="text-xs font-medium text-muted-foreground"
              >
                WSUS server
              </Label>
              <Select
                value={serverFilter}
                onValueChange={(v) => {
                  setServerFilter(v ?? "all");
                  setGroupFilter("all");
                  setPage(1);
                }}
              >
                <SelectTrigger id="clients-server-filter" className="w-full">
                  <SelectValue className="truncate">
                    {serverFilter === "all" ? "All servers" : serverFilter}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All servers</SelectItem>
                  {servers.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="min-w-0 space-y-1.5">
            <Label
              htmlFor="clients-target-group-filter"
              className="text-xs font-medium text-muted-foreground"
            >
              Target group
            </Label>
            <Select
              value={groupFilter}
              onValueChange={(v) => {
                setGroupFilter(v ?? "all");
                setPage(1);
              }}
            >
              <SelectTrigger
                id="clients-target-group-filter"
                className="w-full"
              >
                <SelectValue className="truncate">
                  {groupFilter === "all" ? "All target groups" : groupFilter}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All target groups</SelectItem>
                {groups.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <div className="rounded-md border bg-background min-w-0 overflow-x-auto">
        <Table className="[&_th]:px-2.5 [&_td]:px-2.5 text-xs">
          <TableHeader>
            <TableRow>
              <SortableTableHead
                label="Computer Name"
                sortKey="computerName"
                activeKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
              <SortableTableHead
                label="IP Address"
                sortKey="ipAddress"
                activeKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
              <SortableTableHead
                label="OS"
                sortKey="osDescription"
                activeKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
              <SortableTableHead
                label="WSUS Server"
                sortKey="serverName"
                activeKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
              <SortableTableHead
                label="Target Group"
                sortKey="assignedTargetGroups"
                activeKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
              <SortableTableHead
                label="Installed / N/A"
                sortKey="installed"
                activeKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
                align="right"
              />
              <SortableTableHead
                label="Pending"
                sortKey="notInstalled"
                activeKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
                align="right"
              />
              <SortableTableHead
                label="Failed"
                sortKey="failed"
                activeKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
                align="right"
              />
              <SortableTableHead
                label="Compliance"
                sortKey="complianceScore"
                activeKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
                align="right"
              />
              <SortableTableHead
                label="Timestamp"
                sortKey="lastSyncTime"
                activeKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
                align="right"
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={10}
                  className="h-24 text-center text-muted-foreground"
                >
                  No matching clients found.
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((c) => {
                const tier = getComplianceTier(c.complianceScore);
                const installedOrNa = c.installed + c.notApplicable;
                return (
                  <TableRow key={c.computerTargetId}>
                    <TableCell className="min-w-[160px] max-w-[220px] font-medium">
                      <Link
                        href={`/clients/${c.computerTargetId}`}
                        title={c.computerName}
                        className="flex items-center gap-1.5 text-primary hover:underline"
                      >
                        <Monitor className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{c.computerName}</span>
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs whitespace-nowrap">
                      {c.ipAddress}
                    </TableCell>
                    <TableCell className="min-w-[130px] max-w-[190px] text-xs">
                      <span className="block truncate" title={c.osDescription}>
                        {c.osDescription}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[120px] font-mono text-xs text-muted-foreground whitespace-nowrap">
                      <span
                        className="block truncate"
                        title={c.serverName || "-"}
                      >
                        {c.serverName || "-"}
                      </span>
                    </TableCell>
                    <TableCell className="min-w-[110px]">
                      {(() => {
                        const targetGroups = splitTargetGroups(
                          c.assignedTargetGroups,
                        );
                        if (targetGroups.length === 0) {
                          return (
                            <span className="text-xs text-muted-foreground">
                              -
                            </span>
                          );
                        }
                        return (
                          <div className="flex flex-wrap gap-1">
                            {targetGroups.map((group) => (
                              <Badge
                                key={group}
                                variant="outline"
                                className="text-xs font-normal"
                              >
                                {group}
                              </Badge>
                            ))}
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell
                      className="text-right whitespace-nowrap"
                      title={`Installed: ${c.installed.toLocaleString()}, Not Applicable: ${c.notApplicable.toLocaleString()}`}
                    >
                      <Badge
                        variant="secondary"
                        className="bg-emerald-500/15 text-emerald-700"
                      >
                        {installedOrNa.toLocaleString()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Badge variant="outline">{c.notInstalled}</Badge>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {c.failed > 0 ? (
                        <Badge variant="destructive">{c.failed}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Badge
                        variant="secondary"
                        className={`tabular-nums ${tier.badgeClass}`}
                      >
                        {Math.round(c.complianceScore)}%
                      </Badge>
                    </TableCell>
                    <TableCell
                      className="text-right font-mono text-xs text-muted-foreground whitespace-nowrap"
                      title={c.lastSyncTime ?? undefined}
                    >
                      {formatBangkokTimestamp(c.lastSyncTime)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>Rows per page:</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(Number.parseInt(v ?? "10", 10));
              setPage(1);
            }}
          >
            <SelectTrigger className="h-8 w-[76px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
            </SelectContent>
          </Select>
          <span>
            Showing{" "}
            {filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–
            {Math.min(currentPage * pageSize, filtered.length)} of{" "}
            {filtered.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span>
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" /> Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
