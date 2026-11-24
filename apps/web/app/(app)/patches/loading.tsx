import {
  FilterBarSkeleton,
  PageHeaderSkeleton,
  TableSkeleton,
} from "../_components/page-skeletons";

export default function PatchesLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton titleWidth="w-36" subtitleWidth="w-72" />
      <FilterBarSkeleton filterCount={4} />
      <TableSkeleton columns={6} rows={10} />
    </div>
  );
}
