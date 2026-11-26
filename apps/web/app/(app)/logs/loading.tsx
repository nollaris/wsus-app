import {
  KpiCardsSkeleton,
  PageHeaderSkeleton,
  TableSkeleton,
} from "../_components/page-skeletons";

export default function LogsLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <KpiCardsSkeleton count={4} />
      <TableSkeleton columns={6} rows={8} />
    </div>
  );
}
