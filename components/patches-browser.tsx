"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { Search, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { Skeleton } from "@/components/ui/skeleton";
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

interface ClientPatchStatusItem {
  id: number;
  serverName: string;
  computerName: string;
  ipAddress: string;
  updateTitle: string;
  kbArticle: string | null;
  classification: string;
  installationState: string;
  approvalAction: string;
}

const SEVERITY_BADGE: Record<string, string> = {
  Critical: "bg-destructive/15 text-destructive",
  Important: "bg-orange-500/15 text-orange-700",
  Moderate: "bg-amber-500/15 text-amber-700",
  Unspecified: "bg-muted text-muted-foreground",
};

const STATE_BADGE: Record<string, string> = {
  Installed: "bg-emerald-500/15 text-emerald-700",
  NotInstalled: "bg-amber-500/15 text-amber-700",
  Failed: "bg-destructive/15 text-destructive",
  Downloaded: "bg-sky-500/15 text-sky-700",
};

type InventorySortKey =
  | "title"
  | "serverName"
  | "kbArticle"
  | "classification"
  | "msrcSeverity"
  | "isApproved"
  | "arrivalDate";

type StatusSortKey =
  | "computerName"
  | "serverName"
  | "updateTitle"
  | "kbArticle"
  | "classification"
  | "installationState";

export function PatchesBrowser({
  classifications,
  severities,
  states,
  servers,
}: {
  classifications: string[];
  severities: string[];
  states: string[];
  servers: string[];
}) {
  const [tab, setTab] = useState<"inventory" | "status">("inventory");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [serverFilter, setServerFilter] = useState("all");
  const [classification, setClassification] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [approved, setApproved] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [invSort, setInvSort] = useState<{ key: InventorySortKey; dir: SortDir }>({
    key: "arrivalDate",
    dir: "desc",
  });
  const [statusSort, setStatusSort] = useState<{ key: StatusSortKey; dir: SortDir }>({
    key: "computerName",
    dir: "asc",
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

  function handleStatusSort(key: StatusSortKey) {
    setStatusSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    );
    setPage(1);
  }

  const [loading, setLoading] = useState(true);
  const [inventoryItems, setInventoryItems] = useState<PatchInventoryItem[]>([]);
  const [statusItems, setStatusItems] = useState<ClientPatchStatusItem[]>([]);
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
        tab,
        page: String(page),
        pageSize: "25",
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (serverFilter !== "all") params.set("serverName", serverFilter);
      if (classification !== "all") params.set("classification", classification);
      if (tab === "inventory") {
        if (severity !== "all") params.set("severity", severity);
        if (approved !== "all") params.set("approved", approved);
        params.set("sortBy", invSort.key);
        params.set("sortDir", invSort.dir);
      } else {
        if (stateFilter !== "all") params.set("state", stateFilter);
        params.set("sortBy", statusSort.key);
        params.set("sortDir", statusSort.dir);
      }

      const res = await fetch(`/api/patches?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      if (tab === "inventory") {
        setInventoryItems(data.items ?? []);
      } else {
        setStatusItems(data.items ?? []);
      }
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } finally {
      setLoading(false);
    }
  }, [
    tab,
    page,
    debouncedSearch,
    serverFilter,
    classification,
    severity,
    approved,
    stateFilter,
    invSort,
    statusSort,
  ]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function handleTabChange(val: string) {
    setTab(val === "status" ? "status" : "inventory");
    setPage(1);
  }

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="inventory">Patch Inventory</TabsTrigger>
          <TabsTrigger value="status">Client Patch Status</TabsTrigger>
        </TabsList>

        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={
                tab === "inventory"
                  ? "Search title, KB, or product..."
                  : "Search computer, title, or KB..."
              }
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

            {tab === "inventory" ? (
              <>
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
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="patches-state-filter"
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
                  <SelectTrigger id="patches-state-filter" className="w-[180px]">
                    <SelectValue placeholder="Install State">
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
              </div>
            )}
          </div>
        </div>

        <TabsContent value="inventory" className="mt-4 min-w-0">
          <div className="rounded-md border bg-background min-w-0 overflow-hidden">
            <Table className="[&_th]:px-2.5 [&_td]:px-2.5">
              <TableHeader>
                <TableRow>
                  <SortableTableHead label="Title" sortKey="title" activeKey={invSort.key} dir={invSort.dir} onSort={handleInvSort} />
                  <SortableTableHead label="Server" sortKey="serverName" activeKey={invSort.key} dir={invSort.dir} onSort={handleInvSort} />
                  <SortableTableHead label="KB" sortKey="kbArticle" activeKey={invSort.key} dir={invSort.dir} onSort={handleInvSort} />
                  <SortableTableHead label="Classification" sortKey="classification" activeKey={invSort.key} dir={invSort.dir} onSort={handleInvSort} />
                  <SortableTableHead label="Severity" sortKey="msrcSeverity" activeKey={invSort.key} dir={invSort.dir} onSort={handleInvSort} />
                  <SortableTableHead label="Status" sortKey="isApproved" activeKey={invSort.key} dir={invSort.dir} onSort={handleInvSort} />
                  <TableHead className="text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, idx) => (
                    <TableRow key={idx}>
                      <TableCell colSpan={7}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : inventoryItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      No patches match your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  inventoryItems.map((p) => (
                    <TableRow key={`${p.serverName}-${p.updateId}-${p.revisionNumber}`}>
                      <TableCell className="max-w-[240px] lg:max-w-sm xl:max-w-md whitespace-normal font-medium">
                        <span className="line-clamp-2" title={p.title}>
                          {p.title}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {p.serverName || "-"}
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
                        <div className="flex flex-wrap gap-1">
                          {p.isApproved && (
                            <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-700">
                              Approved
                            </Badge>
                          )}
                          {p.isDeclined && (
                            <Badge variant="outline" className="text-muted-foreground">
                              Declined
                            </Badge>
                          )}
                          {p.isSuperseded && (
                            <Badge variant="outline" className="text-xs">
                              Superseded
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/patches/${encodeURIComponent(p.updateId)}`}
                          className={buttonVariants({ variant: "ghost", size: "sm" })}
                          aria-label={`View details for ${p.title}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="status" className="mt-4 min-w-0">
          <div className="rounded-md border bg-background min-w-0 overflow-hidden">
            <Table className="[&_th]:px-2.5 [&_td]:px-2.5">
              <TableHeader>
                <TableRow>
                  <SortableTableHead label="Computer" sortKey="computerName" activeKey={statusSort.key} dir={statusSort.dir} onSort={handleStatusSort} />
                  <SortableTableHead label="Server" sortKey="serverName" activeKey={statusSort.key} dir={statusSort.dir} onSort={handleStatusSort} />
                  <SortableTableHead label="Update Title" sortKey="updateTitle" activeKey={statusSort.key} dir={statusSort.dir} onSort={handleStatusSort} />
                  <SortableTableHead label="KB" sortKey="kbArticle" activeKey={statusSort.key} dir={statusSort.dir} onSort={handleStatusSort} />
                  <SortableTableHead label="Classification" sortKey="classification" activeKey={statusSort.key} dir={statusSort.dir} onSort={handleStatusSort} />
                  <SortableTableHead label="State" sortKey="installationState" activeKey={statusSort.key} dir={statusSort.dir} onSort={handleStatusSort} align="right" />
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
                ) : statusItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      No client patch records match your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  statusItems.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="max-w-[180px] font-medium text-xs">
                        <span className="block truncate" title={s.computerName}>
                          {s.computerName}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {s.serverName || "-"}
                      </TableCell>
                      <TableCell className="max-w-[240px] lg:max-w-sm xl:max-w-md whitespace-normal text-sm">
                        <span className="line-clamp-2" title={s.updateTitle}>
                          {s.updateTitle}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {s.kbArticle ? `KB${s.kbArticle}` : "-"}
                      </TableCell>
                      <TableCell className="text-xs">{s.classification}</TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant="secondary"
                          className={STATE_BADGE[s.installationState] || ""}
                        >
                          {s.installationState}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

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
