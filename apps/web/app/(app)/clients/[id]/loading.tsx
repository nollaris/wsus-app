import {
  ChartsGridSkeleton,
  FilterBarSkeleton,
  KpiCardsSkeleton,
  PageHeaderSkeleton,
  TableSkeleton,
} from "../../_components/page-skeletons";

export default function ClientDetailLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton hasBackLink titleWidth="w-60" subtitleWidth="w-72" />
      <KpiCardsSkeleton count={4} />
      <ChartsGridSkeleton count={2} heightClass="h-[240px]" />
      <FilterBarSkeleton filterCount={2} />
      <TableSkeleton columns={6} rows={8} />
    </div>
  );
}
