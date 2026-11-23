import { Card, CardContent, CardHeader } from "@workspace/ui/components/ui/card";
import { Skeleton } from "@workspace/ui/components/ui/skeleton";

export function PageHeaderSkeleton({
  hasBackLink = false,
  titleWidth = "w-56",
  subtitleWidth = "w-80",
}: {
  hasBackLink?: boolean;
  titleWidth?: string;
  subtitleWidth?: string;
}) {
  return (
    <div className="space-y-2">
      {hasBackLink && <Skeleton className="mb-3 h-4 w-36" />}
      <Skeleton className={`h-8 ${titleWidth} max-w-full`} />
      <Skeleton className={`h-4 ${subtitleWidth} max-w-full`} />
    </div>
  );
}

export function KpiCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, idx) => (
        <Card key={idx}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-4 rounded-sm" />
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-3 w-36" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ChartsGridSkeleton({
  count = 2,
  heightClass = "h-[260px]",
}: {
  count?: number;
  heightClass?: string;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {Array.from({ length: count }).map((_, idx) => (
        <Card key={idx}>
          <CardHeader className="space-y-2">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-3.5 w-64" />
          </CardHeader>
          <CardContent>
            <Skeleton className={`w-full rounded-md ${heightClass}`} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function FilterBarSkeleton({ filterCount = 3 }: { filterCount?: number }) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <Skeleton className="h-9 w-full lg:max-w-sm" />
      <div className="flex flex-wrap items-center gap-2">
        {Array.from({ length: filterCount }).map((_, idx) => (
          <Skeleton key={idx} className="h-9 w-36" />
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton({
  columns = 5,
  rows = 8,
}: {
  columns?: number;
  rows?: number;
}) {
  return (
    <div className="rounded-md border bg-background overflow-hidden">
      <div className="border-b px-4 py-3">
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }).map((_, idx) => (
            <Skeleton key={idx} className="h-4 w-20" />
          ))}
        </div>
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div
            key={rowIdx}
            className="grid gap-4 px-4 py-3.5"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: columns }).map((_, colIdx) => (
              <Skeleton
                key={colIdx}
                className={colIdx === 0 ? "h-4 w-4/5" : "h-4 w-3/5"}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function TableCardSkeleton({
  columns = 3,
  rows = 5,
}: {
  columns?: number;
  rows?: number;
}) {
  return (
    <Card>
      <CardHeader className="space-y-2">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-3.5 w-64" />
      </CardHeader>
      <CardContent>
        <TableSkeleton columns={columns} rows={rows} />
      </CardContent>
    </Card>
  );
}
