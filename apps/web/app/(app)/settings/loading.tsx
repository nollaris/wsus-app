import { Card, CardContent, CardHeader } from "@workspace/ui/components/ui/card";
import { Skeleton } from "@workspace/ui/components/ui/skeleton";
import { PageHeaderSkeleton } from "../_components/page-skeletons";

export default function SettingsLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton titleWidth="w-36" subtitleWidth="w-96" />
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 3 }).map((_, idx) => (
          <Card key={idx} className={idx === 2 ? "lg:col-span-2" : undefined}>
            <CardHeader className="space-y-2">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-3.5 w-64" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-9 w-48" />
              <Skeleton className="h-4 w-72" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
