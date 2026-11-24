import { Card, CardContent, CardHeader } from "@workspace/ui/components/ui/card";
import { Skeleton } from "@workspace/ui/components/ui/skeleton";
import {
  KpiCardsSkeleton,
  PageHeaderSkeleton,
  TableCardSkeleton,
} from "../../_components/page-skeletons";

export default function ServerControlLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton hasBackLink titleWidth="w-64" subtitleWidth="w-80" />
      <KpiCardsSkeleton count={4} />
      <Card>
        <CardHeader className="space-y-2">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-3.5 w-72" />
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 w-32" />
        </CardContent>
      </Card>
      <TableCardSkeleton columns={5} rows={6} />
    </div>
  );
}
