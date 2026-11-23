"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, Monitor, ChevronLeft, ChevronRight } from "lucide-react";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface ClientRow {
  serverName: string;
  computerTargetId: string;
  computerName: string;
  ipAddress: string;
  osDescription: string;
  clientVersion: string;
  computerRole: string;
  assignedTargetGroups: string;
  lastSyncTime: string | null;
  lastReportedStatusTime: string | null;
  installed: number;
  notInstalled: number;
  failed: number;
}

export function ClientsTable({ clients }: { clients: ClientRow[] }) {
  const [search, setSearch] = useState("");
  const [serverFilter, setServerFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const servers = useMemo(() => {
    const set = new Set<string>();
    clients.forEach((c) => {
      if (c.serverName) set.add(c.serverName);
    });
    return Array.from(set).sort();
  }, [clients]);

  const groups = useMemo(() => {
    const set = new Set<string>();
    clients.forEach((c) => {
      if (c.assignedTargetGroups) set.add(c.assignedTargetGroups);
    });
    return Array.from(set).sort();
  }, [clients]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter((c) => {
      if (serverFilter !== "all" && c.serverName !== serverFilter) {
        return false;
      }
      if (groupFilter !== "all" && c.assignedTargetGroups !== groupFilter) {
        return false;
      }
      if (!q) return true;
      return (
        c.computerName.toLowerCase().includes(q) ||
        c.ipAddress.toLowerCase().includes(q) ||
        c.osDescription.toLowerCase().includes(q) ||
        c.clientVersion.toLowerCase().includes(q) ||
        c.serverName.toLowerCase().includes(q)
      );
    });
  }, [clients, search, serverFilter, groupFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search hostname, IP, OS, or version..."
            className="pl-9"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {servers.length > 0 && (
            <>
              <Label
                htmlFor="clients-server-filter"
                className="text-sm text-muted-foreground whitespace-nowrap"
              >
                Server
              </Label>
              <Select
                value={serverFilter}
                onValueChange={(v) => {
                  setServerFilter(v ?? "all");
                  setPage(1);
                }}
              >
                <SelectTrigger id="clients-server-filter" className="w-[170px]">
                  <SelectValue placeholder="WSUS Server" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Servers</SelectItem>
                  {servers.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
          <Label
            htmlFor="clients-target-group-filter"
            className="text-sm text-muted-foreground whitespace-nowrap"
          >
            Target Group
          </Label>
          <Select
            value={groupFilter}
            onValueChange={(v) => {
              setGroupFilter(v ?? "all");
              setPage(1);
            }}
          >
            <SelectTrigger id="clients-target-group-filter" className="w-[220px]">
              <SelectValue placeholder="Target Group" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Target Groups</SelectItem>
              {groups.map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {filtered.length} of {clients.length}
          </span>
        </div>
      </div>

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Computer Name</TableHead>
              <TableHead>WSUS Server</TableHead>
              <TableHead>IP Address</TableHead>
              <TableHead>OS</TableHead>
              <TableHead>Target Group</TableHead>
              <TableHead>Last Sync</TableHead>
              <TableHead className="text-right">Installed</TableHead>
              <TableHead className="text-right">Pending</TableHead>
              <TableHead className="text-right">Failed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                  No matching clients found.
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((c) => (
                <TableRow key={c.computerTargetId}>
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
                  <TableCell className="text-xs">{c.osDescription}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs font-normal">
                      {c.assignedTargetGroups}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {c.lastSyncTime
                      ? c.lastSyncTime.replace("T", " ").slice(0, 19)
                      : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-700">
                      {c.installed}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="outline">{c.notInstalled}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {c.failed > 0 ? (
                      <Badge variant="destructive">{c.failed}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">0</span>
                    )}
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
