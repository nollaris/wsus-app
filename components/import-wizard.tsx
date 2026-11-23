"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  FileSpreadsheet,
  FileArchive,
  X,
  CheckCircle2,
  AlertCircle,
  SkipForward,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ImportResultRow {
  fileName: string;
  table: string;
  rowsParsed: number;
  rowsImported: number;
  status: "success" | "skipped" | "error";
  message?: string;
}

const SUPPORTED_FILES = [
  "Classifications.csv",
  "Products.csv",
  "Client_Status.csv",
  "Patch_Inventory.csv",
  "Client_Patch_Status.csv",
  "Synchronization_History.csv",
  "Synchronization_Settings.csv",
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function ImportWizard() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<"replace" | "append">("replace");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ImportResultRow[] | null>(null);
  const [totalImported, setTotalImported] = useState<number>(0);

  function addFiles(incoming: FileList | null) {
    if (!incoming) return;
    const valid = Array.from(incoming).filter((f) => {
      const lower = f.name.toLowerCase();
      return lower.endsWith(".csv") || lower.endsWith(".zip");
    });
    if (valid.length === 0) {
      setError("Only .csv and .zip files are supported.");
      return;
    }
    setError(null);
    setFiles((prev) => {
      const existing = new Set(prev.map((p) => `${p.name}:${p.size}`));
      return [
        ...prev,
        ...valid.filter((f) => !existing.has(`${f.name}:${f.size}`)),
      ];
    });
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleImport() {
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    setResults(null);
    try {
      const formData = new FormData();
      formData.append("mode", mode);
      files.forEach((f) => formData.append("files", f));

      const res = await fetch("/api/import", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Import failed.");
        return;
      }
      setResults(data.results ?? []);
      setTotalImported(data.totalImported ?? 0);
      setFiles([]);
      router.refresh();
    } catch {
      setError("Network error while uploading files.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Upload CSV or ZIP Archive</CardTitle>
            <CardDescription>
              Drop one or more WSUS CSV files, or a single <code>.zip</code>{" "}
              archive containing all CSV exports.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                addFiles(e.dataTransfer.files);
              }}
              onClick={() => inputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                dragging
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
              }`}
            >
              <Upload className="mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">
                Click to browse or drag &amp; drop files here
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Supports multiple <code>.csv</code> files or <code>.zip</code>{" "}
                archives
              </p>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.zip"
                multiple
                className="hidden"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>

            {files.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">
                  Selected Files ({files.length})
                </div>
                <div className="divide-y rounded-md border">
                  {files.map((f, idx) => {
                    const isZip = f.name.toLowerCase().endsWith(".zip");
                    return (
                      <div
                        key={`${f.name}-${idx}`}
                        className="flex items-center justify-between px-3 py-2 text-sm"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {isZip ? (
                            <FileArchive className="h-4 w-4 shrink-0 text-amber-600" />
                          ) : (
                            <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-600" />
                          )}
                          <span className="truncate font-medium">{f.name}</span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {formatBytes(f.size)}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => removeFile(idx)}
                          disabled={uploading}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Import Mode:
                </span>
                <Select
                  value={mode}
                  onValueChange={(v) =>
                    setMode(v === "append" ? "append" : "replace")
                  }
                  disabled={uploading}
                >
                  <SelectTrigger className="w-[220px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="replace">
                      Replace matching tables
                    </SelectItem>
                    <SelectItem value="append">
                      Append (skip duplicates)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={handleImport}
                disabled={files.length === 0 || uploading}
              >
                {uploading ? "Importing to PostgreSQL..." : "Start Import"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Supported WSUS Files</CardTitle>
            <CardDescription>
              Files are matched automatically by filename (inside ZIP or direct
              upload).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {SUPPORTED_FILES.map((name) => (
                <li
                  key={name}
                  className="flex items-center gap-2 font-mono text-xs text-muted-foreground"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="text-foreground">{name}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {results && (
        <Card>
          <CardHeader>
            <CardTitle>Import Results</CardTitle>
            <CardDescription>
              Imported {totalImported.toLocaleString()} total rows into PostgreSQL
              ({mode} mode).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Target Table</TableHead>
                  <TableHead className="text-right">Parsed</TableHead>
                  <TableHead className="text-right">Imported</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r, i) => (
                  <TableRow key={`${r.fileName}-${i}`}>
                    <TableCell className="font-mono text-xs font-medium">
                      {r.fileName}
                    </TableCell>
                    <TableCell className="text-xs">{r.table}</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {r.rowsParsed.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {r.rowsImported.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {r.status === "success" && (
                        <Badge
                          variant="secondary"
                          className="gap-1 bg-emerald-500/15 text-emerald-700"
                        >
                          <CheckCircle2 className="h-3 w-3" /> Success
                        </Badge>
                      )}
                      {r.status === "skipped" && (
                        <Badge variant="outline" className="gap-1">
                          <SkipForward className="h-3 w-3" /> Skipped
                        </Badge>
                      )}
                      {r.status === "error" && (
                        <Badge variant="destructive" className="gap-1">
                          <AlertCircle className="h-3 w-3" /> Error
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.message || "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
