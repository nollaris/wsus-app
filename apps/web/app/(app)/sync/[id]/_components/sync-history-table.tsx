"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatBangkokTimestamp } from "@/lib/format";
import { Badge } from "@workspace/ui/components/ui/badge";
import { Button } from "@workspace/ui/components/ui/button";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/ui/table";

export interface SyncHistoryRow {
  serverName: string;
  synchronizationId: string;
  startTime: string | null;
  endTime: string | null;
  result: string;
  startedManually: boolean;
  error: string | null;
  errorText: string | null;
}

function getResultBadgeClass(result: string): string {
  const normalized = result.trim().toLowerCase();
  if (normalized === "succeeded" || normalized === "success") {
    return "bg-emerald-500/15 text-emerald-700";
  }
  if (normalized === "failed" || normalized === "failure" || normalized === "error") {
    return "bg-destructive/15 text-destructive";
  }
  if (normalized === "cancelled" || normalized === "canceled") {
    return "bg-amber-500/15 text-amber-700";
  }
  if (normalized === "in progress" || normalized === "running") {
    return "bg-sky-500/15 text-sky-700";
  }
  return "";
}

export function SyncHistoryTable({ rows }: { rows: SyncHistoryRow[] }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const pagedRows = rows.slice(startIndex, startIndex + pageSize);

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-md border">
        <Table className="min-w-[680px]">
          <TableHeader>
            <TableRow>
              <TableHead>Started Timestamp</TableHead>
              <TableHead>Ended Timestamp</TableHead>
              <TableHead>Trigger</TableHead>
              <TableHead>Result</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  No synchronization history records found.
                </TableCell>
              </TableRow>
            ) : (
              pagedRows.map((h) => (
                <TableRow key={`${h.serverName}-${h.synchronizationId}`}>
                  <TableCell className="font-mono text-xs">
                    {formatBangkokTimestamp(h.startTime)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {formatBangkokTimestamp(h.endTime)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {h.startedManually ? "Manual" : "Scheduled"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={getResultBadgeClass(h.result)}
                    >
                      {h.result}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[320px] whitespace-normal break-words text-xs text-muted-foreground">
                    {h.errorText || h.error || "-"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-3">
          <span>
            Showing {rows.length === 0 ? 0 : startIndex + 1}–
            {Math.min(currentPage * pageSize, rows.length)} of {rows.length}
          </span>
          <Select
            value={String(pageSize)}
            onValueChange={(val) => {
              setPageSize(Number(val));
              setPage(1);
            }}
          >
            <SelectTrigger className="h-8 w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="15">15 / page</SelectItem>
              <SelectItem value="25">25 / page</SelectItem>
              <SelectItem value="50">50 / page</SelectItem>
            </SelectContent>
          </Select>
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
