import {
  KpiCardsSkeleton,
  PageHeaderSkeleton,
  TableSkeleton,
} from "@/components/page-skeletons";

export default function AppLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <KpiCardsSkeleton count={4} />
      <TableSkeleton columns={5} rows={8} />
    </div>
  );
}
