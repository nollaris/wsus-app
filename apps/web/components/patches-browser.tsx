"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@workspace/ui/components/ui/input";
import { Label } from "@workspace/ui/components/ui/label";
import { Button } from "@workspace/ui/components/ui/button";
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
import { Skeleton } from "@workspace/ui/components/ui/skeleton";
import { SortableTableHead, type SortDir } from "@/components/sortable-table-head";

interface PatchInventoryItem {
  serverName: string;
  updateId: string;
  revisionNumber: number;
  title: string;
  kbArticle: string | null;
  products: string | null;
  classification: string;
  arrivalDate: string | null;
  msrcSeverity: string;
  isApproved: boolean;
  isDeclined: boolean;
  isSuperseded: boolean;
  updateType: string;
  description: string;
}

const SEVERITY_BADGE: Record<string, string> = {
  Critical: "bg-destructive/15 text-destructive",
  Important: "bg-orange-500/15 text-orange-700",
  Moderate: "bg-amber-500/15 text-amber-700",
  Unspecified: "bg-muted text-muted-foreground",
};

type InventorySortKey =
  | "title"
  | "kbArticle"
  | "classification"
  | "msrcSeverity"
  | "isApproved"
  | "isSuperseded"
  | "arrivalDate";

export function PatchesBrowser({
  classifications,
  severities,
  servers,
}: {
  classifications: string[];
  severities: string[];
  servers: string[];
}) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [serverFilter, setServerFilter] = useState("all");
  const [classification, setClassification] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [approved, setApproved] = useState("all");
  const [invSort, setInvSort] = useState<{ key: InventorySortKey; dir: SortDir }>({
    key: "arrivalDate",
    dir: "desc",
  });
  const [page, setPage] = useState(1);

  function handleInvSort(key: InventorySortKey) {
    setInvSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "arrivalDate" ? "desc" : "asc" }
    );
    setPage(1);
  }

  const [loading, setLoading] = useState(true);
  const [inventoryItems, setInventoryItems] = useState<PatchInventoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        tab: "inventory",
        page: String(page),
        pageSize: "25",
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (serverFilter !== "all") params.set("serverName", serverFilter);
      if (classification !== "all") params.set("classification", classification);
      if (severity !== "all") params.set("severity", severity);
      if (approved !== "all") params.set("approved", approved);
      params.set("sortBy", invSort.key);
      params.set("sortDir", invSort.dir);

      const res = await fetch(`/api/patches?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      setInventoryItems(data.items ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } finally {
      setLoading(false);
    }
  }, [
    page,
    debouncedSearch,
    serverFilter,
    classification,
    severity,
    approved,
    invSort,
  ]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const handleDataUpdated = () => {
      void fetchData();
    };
    window.addEventListener("wsus:data-updated", handleDataUpdated);
    return () => {
      window.removeEventListener("wsus:data-updated", handleDataUpdated);
    };
  }, [fetchData]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search title, KB, or product..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

          <div className="hidden xl:flex flex-wrap items-center gap-3">
            {servers.length > 0 && (
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="patches-server-filter"
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
                  <SelectTrigger id="patches-server-filter" className="w-[160px]">
                    <SelectValue placeholder="WSUS Server">
                      {serverFilter === "all" ? "All Servers" : serverFilter}
                    </SelectValue>
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
              </div>
            )}
            <div className="flex items-center gap-2">
              <Label
                htmlFor="patches-classification-filter"
                className="text-sm text-muted-foreground whitespace-nowrap"
              >
                Classification
              </Label>
              <Select
                value={classification}
                onValueChange={(v) => {
                  setClassification(v ?? "all");
                  setPage(1);
                }}
              >
                <SelectTrigger id="patches-classification-filter" className="w-[180px]">
                  <SelectValue placeholder="Classification">
                    {classification === "all" ? "All Classifications" : classification}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classifications</SelectItem>
                  {classifications.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

                <div className="flex items-center gap-2">
                  <Label
                    htmlFor="patches-severity-filter"
                    className="text-sm text-muted-foreground whitespace-nowrap"
                  >
                    Severity
                  </Label>
                  <Select
                    value={severity}
                    onValueChange={(v) => {
                      setSeverity(v ?? "all");
                      setPage(1);
                    }}
                  >
                    <SelectTrigger id="patches-severity-filter" className="w-[150px]">
                      <SelectValue placeholder="Severity">
                        {severity === "all" ? "All Severities" : severity}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Severities</SelectItem>
                      {severities.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Label
                    htmlFor="patches-approval-filter"
                    className="text-sm text-muted-foreground whitespace-nowrap"
                  >
                    Approval
                  </Label>
                  <Select
                    value={approved}
                    onValueChange={(v) => {
                      setApproved(v ?? "all");
                      setPage(1);
                    }}
                  >
                    <SelectTrigger id="patches-approval-filter" className="w-[150px]">
                      <SelectValue placeholder="Approval">
                        {approved === "all"
                          ? "All Approvals"
                          : approved === "approved"
                            ? "Approved Only"
                            : "Declined Only"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Approvals</SelectItem>
                      <SelectItem value="approved">Approved Only</SelectItem>
                      <SelectItem value="declined">Declined Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
          </div>
        </div>

        <div className="rounded-md border bg-background min-w-0 overflow-hidden">
          <Table className="[&_th]:px-2.5 [&_td]:px-2.5">
              <TableHeader>
                <TableRow>
                  <SortableTableHead label="Title" sortKey="title" activeKey={invSort.key} dir={invSort.dir} onSort={handleInvSort} />
                  <SortableTableHead label="KB" sortKey="kbArticle" activeKey={invSort.key} dir={invSort.dir} onSort={handleInvSort} />
                  <SortableTableHead label="Classification" sortKey="classification" activeKey={invSort.key} dir={invSort.dir} onSort={handleInvSort} />
                  <SortableTableHead label="Severity" sortKey="msrcSeverity" activeKey={invSort.key} dir={invSort.dir} onSort={handleInvSort} />
                  <SortableTableHead label="Approval" sortKey="isApproved" activeKey={invSort.key} dir={invSort.dir} onSort={handleInvSort} />
                  <SortableTableHead label="Superseded" sortKey="isSuperseded" activeKey={invSort.key} dir={invSort.dir} onSort={handleInvSort} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, idx) => (
                    <TableRow key={idx}>
                      <TableCell colSpan={6}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : inventoryItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      No patches match your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  inventoryItems.map((p) => (
                    <TableRow key={p.updateId}>
                      <TableCell className="max-w-[240px] lg:max-w-sm xl:max-w-md whitespace-normal font-medium">
                        <Link
                          href={`/patches/${encodeURIComponent(p.updateId)}`}
                          className="line-clamp-2 text-primary hover:underline"
                          title={p.title}
                        >
                          {p.title}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {p.kbArticle ? `KB${p.kbArticle}` : "-"}
                      </TableCell>
                      <TableCell className="text-xs">{p.classification}</TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={SEVERITY_BADGE[p.msrcSeverity] || ""}
                        >
                          {p.msrcSeverity}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {p.isApproved ? (
                          <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-700">
                            Approved
                          </Badge>
                        ) : p.isDeclined ? (
                          <Badge variant="outline" className="text-muted-foreground">
                            Declined
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-amber-700 border-amber-500/30 bg-amber-500/10">
                            Not Approved
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {p.isSuperseded ? (
                          <Badge variant="outline" className="text-xs">
                            Superseded
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Total: {total.toLocaleString()} records &middot; Page {page} of{" "}
          {totalPages}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" /> Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
