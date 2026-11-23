import {
  ChartsGridSkeleton,
  KpiCardsSkeleton,
  PageHeaderSkeleton,
  TableCardSkeleton,
} from "@/components/page-skeletons";

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton titleWidth="w-52" subtitleWidth="w-96" />
      <KpiCardsSkeleton count={4} />
      <ChartsGridSkeleton count={2} heightClass="h-[280px]" />
      <div className="grid gap-4 lg:grid-cols-2">
        <TableCardSkeleton columns={3} rows={5} />
        <TableCardSkeleton columns={4} rows={5} />
      </div>
    </div>
  );
}
