"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, ChevronLeft, ChevronRight, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableTableHead, type SortDir } from "@/components/sortable-table-head";

export interface PatchClientStatusRow {
  id: number;
  serverName: string;
  computerTargetId: string;
  computerName: string;
  ipAddress: string;
  installationState: string;
  approvalAction: string;
}

const STATE_BADGE: Record<string, string> = {
  Installed: "bg-emerald-500/15 text-emerald-700",
  NotInstalled: "bg-amber-500/15 text-amber-700",
  Failed: "bg-destructive/15 text-destructive",
  Downloaded: "bg-sky-500/15 text-sky-700",
};

type ClientSortKey =
  | "computerName"
  | "serverName"
  | "ipAddress"
  | "approvalAction"
  | "installationState";

function compareStrings(a: string, b: string) {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la < lb) return -1;
  if (la > lb) return 1;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function PatchClientsTable({
  clientStatuses,
}: {
  clientStatuses: PatchClientStatusRow[];
}) {
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [sortKey, setSortKey] = useState<ClientSortKey>("installationState");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  function handleSort(key: ClientSortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  const states = useMemo(() => {
    return Array.from(new Set(clientStatuses.map((c) => c.installationState))).sort();
  }, [clientStatuses]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clientStatuses.filter((c) => {
      if (stateFilter !== "all" && c.installationState !== stateFilter) {
        return false;
      }
      if (!q) return true;
      return (
        c.computerName.toLowerCase().includes(q) ||
        c.serverName.toLowerCase().includes(q) ||
        c.ipAddress.toLowerCase().includes(q) ||
        c.approvalAction.toLowerCase().includes(q)
      );
    });
  }, [clientStatuses, search, stateFilter]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    const mul = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      const va = a[sortKey] ?? "";
      const vb = b[sortKey] ?? "";
      return compareStrings(va, vb) * mul;
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search computer, server, or IP..."
            className="pl-9"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="hidden lg:flex items-center gap-2">
          <Label
            htmlFor="patch-clients-state-filter"
            className="text-sm text-muted-foreground whitespace-nowrap"
          >
            Install State
          </Label>
          <Select
            value={stateFilter}
            onValueChange={(v) => {
              setStateFilter(v ?? "all");
              setPage(1);
            }}
          >
            <SelectTrigger id="patch-clients-state-filter" className="w-[180px]">
              <SelectValue placeholder="Installation State">
                {stateFilter === "all" ? "All States" : stateFilter}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All States</SelectItem>
              {states.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {filtered.length} of {clientStatuses.length}
          </span>
        </div>
      </div>

      <div className="rounded-md border bg-background">
        <Table>
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
                label="Server"
                sortKey="serverName"
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
                label="Approval"
                sortKey="approvalAction"
                activeKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
              <SortableTableHead
                label="State"
                sortKey="installationState"
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
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  {clientStatuses.length === 0
                    ? "No client installation records for this patch."
                    : "No client records match the filter."}
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/clients/${c.computerTargetId}`}
                      className="inline-flex items-center gap-2 text-primary hover:underline"
                    >
                      <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
                      {c.computerName}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {c.serverName || "-"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{c.ipAddress}</TableCell>
                  <TableCell className="text-xs">{c.approvalAction}</TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant="secondary"
                      className={STATE_BADGE[c.installationState] || ""}
                    >
                      {c.installationState}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
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
