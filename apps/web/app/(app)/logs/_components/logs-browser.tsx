"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button } from "@workspace/ui/components/ui/button";
import { Card, CardContent, CardDescription, CardTitle } from "@workspace/ui/components/ui/card";
import { Input } from "@workspace/ui/components/ui/input";
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
import { Skeleton } from "@workspace/ui/components/ui/skeleton";

interface UserAction {
  id: number;
  createdAt: string;
  username: string;
  action: string;
  target: string;
  details: string;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  });
}

export function LogsBrowser() {
  const [entries, setEntries] = useState<UserAction[]>([]);
  const [users, setUsers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [username, setUsername] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        username,
        page: String(page),
        pageSize: String(pageSize),
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      const response = await fetch(`/api/logs?${params.toString()}`);
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(
          typeof data?.error === "string"
            ? data.error
            : `Failed to load user action logs (${response.status}).`
        );
        setEntries([]);
        setTotal(0);
        return;
      }
      const data = await response.json();
      if (!Array.isArray(data.entries) || !Array.isArray(data.users)) {
        setError("The user action log response was invalid.");
        setEntries([]);
        setTotal(0);
        return;
      }
      setEntries(data.entries);
      setUsers(data.users);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      setPage(data.page);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Failed to load user action logs."
      );
      setEntries([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [username, debouncedSearch, page, pageSize]);

  useEffect(() => {
    const timer = setTimeout(() => void fetchLogs(), 0);
    return () => clearTimeout(timer);
  }, [fetchLogs]);

  return (
    <div className="space-y-4">
      <Card size="sm">
        <CardContent className="flex items-center justify-between gap-3">
          <div>
            <CardDescription>Recorded user actions</CardDescription>
            <CardTitle className="mt-1 font-mono text-2xl tabular-nums">
              {total.toLocaleString()}
            </CardTitle>
          </div>
          <p className="max-w-md text-right text-sm text-muted-foreground">
            User-initiated operations only. Server health and background WSUS
            status are not shown here.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(220px,1fr)_220px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search user actions..."
                className="pl-9"
              />
            </div>
            <Select
              value={username}
              onValueChange={(value) => {
                setUsername(value ?? "all");
                setPage(1);
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All users</SelectItem>
                {users.map((user) => (
                  <SelectItem key={user} value={user}>{user}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="overflow-x-auto rounded-md border">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Time · ICT</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, index) => (
                    <TableRow key={index}>
                      {Array.from({ length: 5 }).map((__, cell) => (
                        <TableCell key={cell}><Skeleton className="h-5 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : entries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      No user actions match the active filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap font-mono text-xs">
                        {formatTimestamp(entry.createdAt)}
                      </TableCell>
                      <TableCell className="font-medium">{entry.username}</TableCell>
                      <TableCell>{entry.action}</TableCell>
                      <TableCell>{entry.target}</TableCell>
                      <TableCell className="max-w-[360px] whitespace-normal break-words text-xs text-muted-foreground">
                        {entry.details}
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
                Showing {total === 0 ? 0 : (page - 1) * pageSize + 1}–
                {Math.min(page * pageSize, total)} of {total}
              </span>
              <Select
                value={String(pageSize)}
                onValueChange={(value) => {
                  setPageSize(Number(value));
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-8 w-[100px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25 / page</SelectItem>
                  <SelectItem value="50">50 / page</SelectItem>
                  <SelectItem value="100">100 / page</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span>Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                <ChevronLeft className="size-4" /> Prev
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>
                Next <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
