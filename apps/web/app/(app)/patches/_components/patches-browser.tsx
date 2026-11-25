"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Package,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  XCircle,
} from "lucide-react";
import { Input } from "@workspace/ui/components/ui/input";
import { Label } from "@workspace/ui/components/ui/label";
import { Button } from "@workspace/ui/components/ui/button";
import { Badge } from "@workspace/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@workspace/ui/components/ui/card";
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
import { formatKbArticle } from "@/lib/format";

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

interface PatchInventoryStats {
  total: number;
  approved: number;
  declined: number;
  critical: number;
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
  const [stats, setStats] = useState<PatchInventoryStats | null>(null);

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
      setStats(data.stats ?? null);
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

  const statCards = [
    {
      label: "Matching patches",
      value: stats?.total,
      icon: Package,
      iconClass: "bg-primary/10 text-primary",
    },
    {
      label: "Approved",
      value: stats?.approved,
      icon: CheckCircle2,
      iconClass: "bg-emerald-500/10 text-emerald-700",
    },
    {
      label: "Declined",
      value: stats?.declined,
      icon: XCircle,
      iconClass: "bg-muted text-muted-foreground",
    },
    {
      label: "Critical severity",
      value: stats?.critical,
      icon: ShieldAlert,
      iconClass: "bg-destructive/10 text-destructive",
    },
  ];

  return (
    <div className="space-y-4">
      <section aria-label="Patch inventory statistics" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Inventory overview</h2>
          <p className="text-xs text-muted-foreground">
            Counts update with the active filters
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {statCards.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.label} size="sm">
                <CardContent className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <CardDescription>{stat.label}</CardDescription>
                    <CardTitle className="mt-1 font-mono text-2xl tabular-nums">
                      {stat.value === undefined ? (
                        <Skeleton className="mt-1 h-7 w-16" />
                      ) : (
                        stat.value.toLocaleString()
                      )}
                    </CardTitle>
                  </div>
                  <div
                    className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${stat.iconClass}`}
                  >
                    <Icon className="size-5" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section
        aria-label="Patch inventory filters"
        className="space-y-4 rounded-2xl border bg-card p-4 sm:p-5"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative min-w-0 flex-1">
            <Label htmlFor="patches-search" className="sr-only">
              Search patches
            </Label>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="patches-search"
              placeholder="Search by title, KB, or product"
              className="h-10 pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <SlidersHorizontal className="size-4" />
            Filter inventory
          </div>
        </div>

        <div className="grid gap-3 border-t pt-4 sm:grid-cols-2 xl:grid-cols-4">
          {servers.length > 0 && (
            <div className="min-w-0 space-y-1.5">
              <Label
                htmlFor="patches-server-filter"
                className="text-xs font-medium text-muted-foreground"
              >
                WSUS server
              </Label>
              <Select
                value={serverFilter}
                onValueChange={(v) => {
                  setServerFilter(v ?? "all");
                  setPage(1);
                }}
              >
                <SelectTrigger id="patches-server-filter" className="w-full">
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
              htmlFor="patches-classification-filter"
              className="text-xs font-medium text-muted-foreground"
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
              <SelectTrigger
                id="patches-classification-filter"
                className="w-full"
              >
                <SelectValue className="truncate">
                  {classification === "all"
                    ? "All classifications"
                    : classification}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All classifications</SelectItem>
                {classifications.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-0 space-y-1.5">
            <Label
              htmlFor="patches-severity-filter"
              className="text-xs font-medium text-muted-foreground"
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
              <SelectTrigger id="patches-severity-filter" className="w-full">
                <SelectValue className="truncate">
                  {severity === "all" ? "All severities" : severity}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                {severities.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-0 space-y-1.5">
            <Label
              htmlFor="patches-approval-filter"
              className="text-xs font-medium text-muted-foreground"
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
              <SelectTrigger id="patches-approval-filter" className="w-full">
                <SelectValue className="truncate">
                  {approved === "all"
                    ? "All approvals"
                    : approved === "approved"
                      ? "Approved only"
                      : "Declined only"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All approvals</SelectItem>
                <SelectItem value="approved">Approved only</SelectItem>
                <SelectItem value="declined">Declined only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

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
                        {formatKbArticle(p.kbArticle)}
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
