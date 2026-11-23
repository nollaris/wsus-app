"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
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

export interface ClientPatchRow {
  id: number;
  updateTitle: string;
  kbArticle: string | null;
  classification: string;
  installationState: string;
  approvalAction: string;
}

const STATE_BADGE: Record<string, string> = {
  Installed: "bg-emerald-500/15 text-emerald-700",
  NotInstalled: "bg-amber-500/15 text-amber-700",
  Failed: "bg-destructive/15 text-destructive",
  Downloaded: "bg-sky-500/15 text-sky-700",
};

export function ClientPatchesTable({ patches }: { patches: ClientPatchRow[] }) {
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("all");

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

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search update title or KB..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={stateFilter} onValueChange={(v) => setStateFilter(v ?? "all")}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Installation State" />
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
              <TableHead>Update Title</TableHead>
              <TableHead>KB</TableHead>
              <TableHead>Classification</TableHead>
              <TableHead>Approval</TableHead>
              <TableHead className="text-right">State</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  No updates match the filter.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="max-w-md font-medium">
                    <span className="line-clamp-2">{p.updateTitle}</span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {p.kbArticle ? `KB${p.kbArticle}` : "-"}
                  </TableCell>
                  <TableCell className="text-xs">{p.classification}</TableCell>
                  <TableCell className="text-xs">{p.approvalAction}</TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant="secondary"
                      className={STATE_BADGE[p.installationState] || ""}
                    >
                      {p.installationState}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
