"use client";

import { useEffect, useState, useCallback } from "react";
import { Search, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

interface PatchInventoryItem {
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

export function PatchesBrowser({
  classifications,
  severities,
  states,
}: {
  classifications: string[];
  severities: string[];
  states: string[];
}) {
  const [tab, setTab] = useState<"inventory" | "status">("inventory");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [classification, setClassification] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [approved, setApproved] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [inventoryItems, setInventoryItems] = useState<PatchInventoryItem[]>([]);
  const [statusItems, setStatusItems] = useState<ClientPatchStatusItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedPatch, setSelectedPatch] = useState<PatchInventoryItem | null>(
    null
  );

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
      if (classification !== "all") params.set("classification", classification);
      if (tab === "inventory") {
        if (severity !== "all") params.set("severity", severity);
        if (approved !== "all") params.set("approved", approved);
      } else {
        if (stateFilter !== "all") params.set("state", stateFilter);
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
  }, [tab, page, debouncedSearch, classification, severity, approved, stateFilter]);

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

          <div className="flex flex-wrap items-center gap-3">
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
                  <SelectValue placeholder="Classification" />
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
                      <SelectValue placeholder="Severity" />
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
                      <SelectValue placeholder="Approval" />
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
                    <SelectValue placeholder="Install State" />
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

        <TabsContent value="inventory" className="mt-4">
          <div className="rounded-md border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>KB</TableHead>
                  <TableHead>Classification</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Details</TableHead>
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
                    <TableRow key={`${p.updateId}-${p.revisionNumber}`}>
                      <TableCell className="max-w-md font-medium">
                        <span className="line-clamp-2">{p.title}</span>
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
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedPatch(p)}
                        >
                          <Info className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="status" className="mt-4">
          <div className="rounded-md border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Computer</TableHead>
                  <TableHead>Update Title</TableHead>
                  <TableHead>KB</TableHead>
                  <TableHead>Classification</TableHead>
                  <TableHead className="text-right">State</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, idx) => (
                    <TableRow key={idx}>
                      <TableCell colSpan={5}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : statusItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      No client patch records match your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  statusItems.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium text-xs">
                        {s.computerName}
                      </TableCell>
                      <TableCell className="max-w-md text-sm">
                        <span className="line-clamp-2">{s.updateTitle}</span>
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

      {/* Patch Detail Modal */}
      <Dialog
        open={Boolean(selectedPatch)}
        onOpenChange={(open) => {
          if (!open) setSelectedPatch(null);
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{selectedPatch?.title}</DialogTitle>
            <DialogDescription>
              {selectedPatch?.kbArticle ? `KB${selectedPatch.kbArticle} · ` : ""}
              {selectedPatch?.classification} · Severity:{" "}
              {selectedPatch?.msrcSeverity}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2 rounded-md bg-muted/50 p-3 text-xs">
              <div>
                <span className="text-muted-foreground">Products:</span>{" "}
                <span className="font-medium">{selectedPatch?.products || "-"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Revision:</span>{" "}
                <span className="font-mono">{selectedPatch?.revisionNumber}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Arrival Date:</span>{" "}
                <span className="font-mono">
                  {selectedPatch?.arrivalDate
                    ? selectedPatch.arrivalDate.slice(0, 10)
                    : "-"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Type:</span>{" "}
                <span>{selectedPatch?.updateType || "-"}</span>
              </div>
            </div>
            <div>
              <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Description
              </h4>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {selectedPatch?.description || "No description available."}
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
