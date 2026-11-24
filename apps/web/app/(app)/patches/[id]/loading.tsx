import { Card, CardContent, CardHeader } from "@workspace/ui/components/ui/card";
import { Skeleton } from "@workspace/ui/components/ui/skeleton";
import {
  KpiCardsSkeleton,
  PageHeaderSkeleton,
  TableCardSkeleton,
} from "../../_components/page-skeletons";

export default function PatchDetailLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton hasBackLink titleWidth="w-96" subtitleWidth="w-64" />
      <KpiCardsSkeleton count={4} />
      <Card>
        <CardHeader className="space-y-2">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </CardContent>
      </Card>
      <TableCardSkeleton columns={5} rows={8} />
    </div>
  );
}
