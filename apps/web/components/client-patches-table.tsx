"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@workspace/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";
import { Input } from "@workspace/ui/components/ui/input";
import { Label } from "@workspace/ui/components/ui/label";
import { Badge } from "@workspace/ui/components/ui/badge";
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
import { SortableTableHead, type SortDir } from "@/components/sortable-table-head";

export interface ClientPatchRow {
  id: number;
  updateTitle: string;
  kbArticle: string | null;
  classification: string;
  installationState: string;
  approvalAction: string;
  errorCode?: string | null;
  errorMessage?: string | null;
}

const STATE_BADGE: Record<string, string> = {
  Installed: "bg-emerald-500/15 text-emerald-700",
  NotInstalled: "bg-amber-500/15 text-amber-700",
  Failed: "bg-destructive/15 text-destructive",
  Downloaded: "bg-sky-500/15 text-sky-700",
};

type PatchSortKey =
  | "updateTitle"
  | "kbArticle"
  | "classification"
  | "approvalAction"
  | "installationState";

export function ClientPatchesTable({ patches }: { patches: ClientPatchRow[] }) {
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [sortKey, setSortKey] = useState<PatchSortKey>("installationState");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedFailure, setSelectedFailure] = useState<ClientPatchRow | null>(
    null
  );

  function handleSort(key: PatchSortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  const states = useMemo(() => {
    return Array.from(new Set(patches.map((p) => p.installationState))).sort();
  }, [patches]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return patches.filter((p) => {
      if (stateFilter !== "all" && p.installationState !== stateFilter) {
        return false;
      }
      if (!q) return true;
      return (
        p.updateTitle.toLowerCase().includes(q) ||
        (p.kbArticle?.toLowerCase().includes(q) ?? false) ||
        p.classification.toLowerCase().includes(q)
      );
    });
  }, [patches, search, stateFilter]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    const mul = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      const va = a[sortKey] ?? "";
      const vb = b[sortKey] ?? "";
      return va.localeCompare(vb) * mul;
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
            placeholder="Search update title or KB..."
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
            htmlFor="client-patches-state-filter"
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
            <SelectTrigger id="client-patches-state-filter" className="w-[180px]">
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
            {filtered.length} of {patches.length}
          </span>
        </div>
      </div>

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead label="Update Title" sortKey="updateTitle" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
              <SortableTableHead label="KB" sortKey="kbArticle" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
              <SortableTableHead label="Classification" sortKey="classification" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
              <SortableTableHead label="Approval" sortKey="approvalAction" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
              <SortableTableHead label="State" sortKey="installationState" activeKey={sortKey} dir={sortDir} onSort={handleSort} align="right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  No updates match the filter.
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="max-w-md font-medium">
                    <span className="line-clamp-2">{p.updateTitle}</span>
                    {p.installationState === "Failed" &&
                      (p.errorCode || p.errorMessage) && (
                        <div className="mt-1 rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">
                          {p.errorCode && (
                            <span className="mr-1.5 font-mono font-semibold">
                              [{p.errorCode}]
                            </span>
                          )}
                          <span>{p.errorMessage ?? "Installation failed"}</span>
                        </div>
                      )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {p.kbArticle ? `KB${p.kbArticle}` : "-"}
                  </TableCell>
                  <TableCell className="text-xs">{p.classification}</TableCell>
                  <TableCell className="text-xs">{p.approvalAction}</TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center justify-end gap-2">
                      <Badge
                        variant="secondary"
                        className={STATE_BADGE[p.installationState] || ""}
                      >
                        {p.installationState}
                      </Badge>
                      {p.installationState === "Failed" && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                          onClick={() => setSelectedFailure(p)}
                        >
                          <AlertCircle className="mr-1 h-3.5 w-3.5" />
                          View Reason
                        </Button>
                      )}
                    </div>
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

      <Dialog
        open={selectedFailure !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedFailure(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Update Failure Reason
            </DialogTitle>
            <DialogDescription>
              {selectedFailure?.updateTitle}
            </DialogDescription>
          </DialogHeader>
          {selectedFailure && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2 rounded-md border p-3">
                <div>
                  <div className="text-xs text-muted-foreground">KB Article</div>
                  <div className="font-mono font-medium">
                    {selectedFailure.kbArticle
                      ? `KB${selectedFailure.kbArticle}`
                      : "-"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Error Code</div>
                  <div className="font-mono font-semibold text-destructive">
                    {selectedFailure.errorCode ?? "Not available"}
                  </div>
                </div>
              </div>
              <div className="rounded-md border bg-muted/40 p-3">
                <div className="mb-1 text-xs font-medium text-muted-foreground">
                  WSUS Event History Details
                </div>
                {selectedFailure.errorMessage ? (
                  <p className="whitespace-pre-wrap text-xs leading-relaxed">
                    {selectedFailure.errorMessage}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No error event was found in WSUS Event History for this
                    update. If you recently updated the WSUS API on the server,
                    run Sync again from the Sync &amp; Servers page, or check
                    the Windows Update Event Log on the client machine.
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
