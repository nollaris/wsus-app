"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { TableHead } from "@workspace/ui/components/ui/table";

export type SortDir = "asc" | "desc";

export function SortableTableHead<T extends string>({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: T;
  activeKey: T;
  dir: SortDir;
  onSort: (key: T) => void;
  align?: "left" | "right";
}) {
  const isActive = activeKey === sortKey;
  const Icon = !isActive ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;

  return (
    <TableHead className={align === "right" ? "text-right" : undefined}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 font-medium hover:text-foreground transition-colors ${
          align === "right" ? "ml-auto flex-row-reverse" : ""
        } ${isActive ? "text-foreground" : "text-muted-foreground"}`}
      >
        <span>{label}</span>
        <Icon className={`h-3.5 w-3.5 ${isActive ? "opacity-100" : "opacity-50"}`} />
      </button>
    </TableHead>
  );
}
