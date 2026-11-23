import {
  FilterBarSkeleton,
  PageHeaderSkeleton,
  TableSkeleton,
} from "@/components/page-skeletons";

export default function ClientsLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton titleWidth="w-44" subtitleWidth="w-80" />
      <FilterBarSkeleton filterCount={2} />
      <TableSkeleton columns={7} rows={10} />
    </div>
  );
}
