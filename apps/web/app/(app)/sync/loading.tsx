import {
  PageHeaderSkeleton,
  TableCardSkeleton,
} from "../_components/page-skeletons";

export default function SyncLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton titleWidth="w-48" subtitleWidth="w-80" />
      <TableCardSkeleton columns={5} rows={4} />
      <div className="grid gap-4 lg:grid-cols-2">
        <TableCardSkeleton columns={3} rows={6} />
        <TableCardSkeleton columns={3} rows={6} />
      </div>
    </div>
  );
}
