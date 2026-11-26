import {
  KpiCardsSkeleton,
  PageHeaderSkeleton,
  TableCardSkeleton,
} from "../_components/page-skeletons";

export default function SyncLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton titleWidth="w-64" subtitleWidth="w-96" />
      <KpiCardsSkeleton count={4} />
      <TableCardSkeleton columns={4} rows={4} />
    </div>
  );
}
